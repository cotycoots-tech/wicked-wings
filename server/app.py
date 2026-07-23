#!/usr/bin/env python3
"""Vision Cell Builder – stdlib HTTP API + static file server."""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import re
import secrets
import threading
import time
import uuid
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Optional
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"
DATA_DIR = ROOT / "data"
DB_PATH = DATA_DIR / "db.json"
COOKIE_NAME = "vcb_session"
SESSION_TTL = 24 * 60 * 60
PORT = int(os.environ.get("PORT", "3847"))
# 0.0.0.0 so Railway (and other hosts) can route external traffic
HOST = os.environ.get("HOST", "0.0.0.0")
PBKDF2_ITERS = 120_000
# Secure cookies when behind HTTPS (Railway sets RAILWAY_* vars)
_COOKIE_SECURE = os.environ.get("COOKIE_SECURE", "").lower() in ("1", "true", "yes") or bool(
    os.environ.get("RAILWAY_ENVIRONMENT") or os.environ.get("RAILWAY_PUBLIC_DOMAIN")
)

_lock = threading.RLock()


# ── Password hashing (stdlib PBKDF2) ───────────────────────────────
def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), PBKDF2_ITERS)
    return f"pbkdf2${PBKDF2_ITERS}${salt}${dk.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        if stored.startswith("pbkdf2$"):
            _, iters_s, salt, hex_hash = stored.split("$", 3)
            dk = hashlib.pbkdf2_hmac(
                "sha256", password.encode(), salt.encode(), int(iters_s)
            )
            return hmac.compare_digest(dk.hex(), hex_hash)
        # Legacy bcrypt-style hashes not supported in stdlib path
        return False
    except Exception:
        return False


def now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


# ── Store ──────────────────────────────────────────────────────────
def default_db() -> dict:
    return {
        "users": [],
        "inventory": [],
        "networkConfigs": [],
        "softwarePackages": [],
        "cells": [],
        "kpis": [],
        "sessions": {},
    }


def ensure_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if not DB_PATH.exists():
        seed_database()


def read_db() -> dict:
    ensure_db()
    with _lock:
        with open(DB_PATH, "r", encoding="utf-8") as f:
            return json.load(f)


def write_db(db: dict) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    tmp = DB_PATH.with_suffix(".tmp")
    with _lock:
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(db, f, indent=2)
        tmp.replace(DB_PATH)


def sanitize_user(user: dict) -> dict:
    return {
        "id": user["id"],
        "username": user["username"],
        "displayName": user["displayName"],
        "role": user["role"],
        "createdAt": user.get("createdAt"),
    }


def get_session_user(token: Optional[str]) -> Optional[dict]:
    if not token:
        return None
    db = read_db()
    session = db.get("sessions", {}).get(token)
    if not session:
        return None
    if session.get("expiresAt", 0) < time.time():
        db["sessions"].pop(token, None)
        write_db(db)
        return None
    user = next((u for u in db["users"] if u["id"] == session["userId"]), None)
    return sanitize_user(user) if user else None


def can_write(role: str) -> bool:
    return role in ("admin", "engineer")


def is_on_target(k: dict) -> bool:
    current = float(k.get("current") or 0)
    target = float(k.get("target") or 0)
    if k.get("direction") == "lower_is_better":
        return current > 0 and current <= target
    return current >= target


def enrich_cell(cell: dict, db: dict) -> dict:
    inventory_details = []
    for row in cell.get("inventoryItems") or []:
        item = next((i for i in db["inventory"] if i["id"] == row.get("inventoryId")), None)
        inventory_details.append({**row, "item": item})
    network = next(
        (n for n in db["networkConfigs"] if n["id"] == cell.get("networkConfigId")), None
    )
    software = [
        p
        for pid in (cell.get("softwarePackageIds") or [])
        for p in db["softwarePackages"]
        if p["id"] == pid
    ]
    kpis = [k for k in db["kpis"] if k.get("cellId") == cell["id"]]
    return {
        **cell,
        "inventoryDetails": inventory_details,
        "network": network,
        "software": software,
        "kpis": kpis,
    }


# ── Seed ───────────────────────────────────────────────────────────
def seed_database() -> None:
    db = default_db()
    ts = now_iso()

    def user(username: str, display: str, role: str, password: str) -> dict:
        return {
            "id": str(uuid.uuid4()),
            "username": username,
            "displayName": display,
            "role": role,
            "passwordHash": hash_password(password),
            "createdAt": ts,
        }

    db["users"] = [
        user("admin", "System Admin", "admin", "admin123"),
        user("engineer", "Cell Engineer", "engineer", "engineer123"),
        user("viewer", "Operations Viewer", "viewer", "viewer123"),
    ]

    def inv(category, name, part, vendor, qty, cost, specs):
        return {
            "id": str(uuid.uuid4()),
            "category": category,
            "name": name,
            "partNumber": part,
            "vendor": vendor,
            "quantityOnHand": qty,
            "unitCost": cost,
            "specs": specs,
            "status": "available" if qty > 0 else "out_of_stock",
            "createdAt": ts,
            "updatedAt": ts,
        }

    db["inventory"] = [
        inv("robot", "ABB IRB 1200 7kg", "IRB1200-7/0.7", "ABB", 4, 28500, {"payloadKg": 7, "reachMm": 700, "axes": 6, "interface": "EtherNet/IP"}),
        inv("robot", "Fanuc LR Mate 200iD", "LR-MATE-200iD", "Fanuc", 3, 32000, {"payloadKg": 7, "reachMm": 717, "axes": 6, "interface": "EtherNet/IP"}),
        inv("robot", "Staubli TX2-140", "TX2-140", "Staubli", 2, 45000, {"payloadKg": 40, "reachMm": 1510, "axes": 6, "interface": "EtherCAT/EtherNet/IP"}),
        inv("camera", "Cognex In-Sight 2800", "IS2800-C", "Cognex", 12, 4200, {"resolution": "1440x1080", "interface": "GigE", "lighting": "integrated"}),
        inv("camera", "Keyence CV-X Series", "CV-X400", "Keyence", 8, 5600, {"resolution": "2048x1536", "interface": "GigE", "lighting": "external"}),
        inv("camera", "Basler ace2 a2A1920", "a2A1920-51gc", "Basler", 15, 890, {"resolution": "1920x1200", "interface": "GigE", "fps": 51}),
        inv(
            "camera",
            "IDS GV-51F0FA-M-GL",
            "GV-51F0FA-M-GL",
            "IDS Imaging",
            2,
            1450,
            {
                "type": "GigE industrial camera",
                "spectrum": "Monochrome",
                "sensor": "Sony IMX547",
                "shutter": "Global shutter",
                "resolution": "2472 x 2064",
                "megapixels": 5.1,
                "sensorFormat": '1/1.8"',
                "interface": "GigE Vision",
                "interfaceSpeed": "1 Gbps",
                "fps": 24.7,
                "ipRating": "IP69K",
                "series": "uEye FA",
                "mount": "C-mount",
            },
        ),
        inv("lighting", "Smart Vision Lights LXE300", "LXE300-WHI", "SVL", 20, 450, {"color": "white", "type": "bar", "voltage": "24VDC"}),
        inv("lighting", "CCS LDR2 Ring Light", "LDR2-90-SW", "CCS", 10, 380, {"color": "white", "type": "ring", "voltage": "24VDC"}),
        inv("plc", "Allen-Bradley CompactLogix 5380", "5069-L320ER", "Rockwell", 6, 3100, {"ioPoints": 32, "ethernetPorts": 2, "memoryMb": 2}),
        inv("plc", "Siemens S7-1500", "6ES7511-1AK02-0AB0", "Siemens", 4, 2800, {"ioPoints": 16, "ethernetPorts": 2, "memoryMb": 1}),
        inv("gripper", "Schunk EGP 40", "EGP-40-N-N-B", "Schunk", 14, 1200, {"strokeMm": 6, "forceN": 140, "interface": "digital"}),
        inv(
            "gripper",
            "Schunk EGM-M-Q-50-1-FX",
            "EGM-M-Q-50-1-FX",
            "Schunk",
            4,
            2800,
            {
                "type": "magnetic_gripper",
                "series": "EGM",
                "manufacturerId": "306351",
                "magnetType": "Monopole",
                "poleForm": "square",
                "poleWidthMm": 50,
                "numberOfPoles": 2,
                "magnetAreaCm2": 50.4,
                "weightKg": 3.45,
                "minWorkpieceThicknessMm": 12,
                "payloadHorizontalKg": 80,
                "payloadVerticalKg": 32,
                "maxActivationsPerMin": 6,
                "ipProtectionClass": "IP54",
                "magneticCircuitA": 2.3,
                "cableLengthCm": 30,
                "diameterDMm": 98,
                "heightZMm": 65,
                "magnetControllerType": "ECG 02",
                "nominalVoltageVac": 400,
                "maxCurrentA": 32,
                "communicationInterface": "digital I/O",
                "maxAmbientTempC": 50,
                "housingMaterial": "Steel",
                "actuation": "Electrical current pulse (electro-permanent magnet)",
            },
        ),
        inv(
            "gripper",
            "Schunk EMH-RP 084-B",
            "EMH-RP-084-B",
            "Schunk",
            0,
            0,
            {
                "type": "magnetic_gripper",
                "series": "EMH",
                "size": "RP 084",
                "manufacturerId": "1351496",
                "holdingForceN": 5370,
                "magnetAreaCm2": 41.25,
                "payloadHorizontalKg": 89,
                "payloadVerticalKg": 35,
                "activationTimeMs": 500,
                "minAmbientTempC": 5,
                "maxAmbientTempC": 50,
                "weightKg": 6.5,
                "ipProtectionClass": "IP52",
                "nominalVoltageV": 24,
                "voltageType": "DC",
                "maxCurrentA": 6.1,
                "ratedCurrentLogicA": 0.15,
                "controllerElectronics": "integrated",
                "lengthXMm": 128,
                "widthYMm": 128,
                "heightZMm": 157,
                "housingMaterial": "Aluminum/steel",
                "actuation": "Electrical current pulse (electro-permanent magnet)",
            },
        ),
        inv("gripper", "OnRobot RG2", "RG2", "OnRobot", 7, 4500, {"strokeMm": 110, "forceN": 40, "interface": "tool_flange"}),
        inv("conveyor", "Dorner 2200 Series", "2200-12-60", "Dorner", 5, 3800, {"widthIn": 12, "lengthIn": 60, "speedFpm": 100}),
        inv("lens", "Computar 12mm C-Mount", "M1214-MP2", "Computar", 25, 145, {"focalLengthMm": 12, "mount": "C", "aperture": "f1.4"}),
        inv("lens", "Lens 8mm C-Mount", "EO-8MM-CM", "Edmund Optics", 10, 195, {"focalLengthMm": 8, "mount": "C", "type": "fixed_focal"}),
        inv("lens", "Lens 4mm C-Mount", "EO-4MM-CM", "Edmund Optics", 10, 185, {"focalLengthMm": 4, "mount": "C", "type": "fixed_focal"}),
        inv("network", "Cisco IE-2000 Switch", "IE-2000-8TC-G-E", "Cisco", 9, 1800, {"ports": 8, "managed": True, "industrial": True}),
        inv("pc", "Advantech IPC-610 Industrial PC", "IPC-610H", "Advantech", 6, 2200, {"cpu": "i7-12700", "ramGb": 32, "storage": "1TB SSD"}),
        inv(
            "pc",
            "Dell Precision 3460",
            "Precision-3460-SFF",
            "Dell",
            1,
            1850,
            {
                "formFactor": "SFF",
                "series": "Precision 3460",
                "cpu": "Intel Core i7-12700 (12th Gen, 12 cores)",
                "chipset": "Intel W680",
                "ramGb": 32,
                "ramType": "DDR5 SODIMM",
                "storage": "512GB NVMe SSD",
                "gpu": "NVIDIA T1000 8GB (optional discrete)",
                "os": "Windows 11 Pro",
                "ethernet": "1x 1GbE RJ-45",
                "ports": "USB 3.2, DisplayPort 1.4, HDMI, audio",
                "powerSupplyW": 300,
                "assetTag": "0418",
                "suppliedBy": "Apera",
                "use": "vision_pc",
            },
        ),
    ]

    by_pn = {i["partNumber"]: i for i in db["inventory"]}

    net_a = {
        "id": str(uuid.uuid4()),
        "name": "Cell A Standard VLAN",
        "description": "Default vision cell network for Cell A builds",
        "vlanId": 120,
        "subnet": "192.168.120.0/24",
        "gateway": "192.168.120.1",
        "dns": ["192.168.1.10", "8.8.8.8"],
        "components": [
            {"role": "robot_controller", "hostname": "cell-a-robot", "ip": "192.168.120.10", "mac": "00:1A:2B:3C:4D:10", "ports": [502, 44818]},
            {"role": "vision_camera_1", "hostname": "cell-a-cam1", "ip": "192.168.120.20", "mac": "00:1A:2B:3C:4D:20", "ports": [3956]},
            {"role": "vision_camera_2", "hostname": "cell-a-cam2", "ip": "192.168.120.21", "mac": "00:1A:2B:3C:4D:21", "ports": [3956]},
            {"role": "plc", "hostname": "cell-a-plc", "ip": "192.168.120.30", "mac": "00:1A:2B:3C:4D:30", "ports": [44818, 2222]},
            {"role": "hmi", "hostname": "cell-a-hmi", "ip": "192.168.120.40", "mac": "00:1A:2B:3C:4D:40", "ports": [80, 443]},
            {"role": "vision_pc", "hostname": "cell-a-vpc", "ip": "192.168.120.50", "mac": "00:1A:2B:3C:4D:50", "ports": [5000, 8080]},
            {"role": "managed_switch", "hostname": "cell-a-sw1", "ip": "192.168.120.2", "mac": "00:1A:2B:3C:4D:02", "ports": [22, 161]},
        ],
        "notes": "Isolated OT VLAN. No internet egress except through jump host.",
        "createdAt": ts,
        "updatedAt": ts,
    }
    net_b = {
        "id": str(uuid.uuid4()),
        "name": "Cell B Dual-Camera GigE",
        "description": "High-bandwidth GigE vision segment for dual camera inspection",
        "vlanId": 130,
        "subnet": "10.30.0.0/24",
        "gateway": "10.30.0.1",
        "dns": ["10.0.0.10"],
        "components": [
            {"role": "robot_controller", "hostname": "cell-b-robot", "ip": "10.30.0.10", "mac": "00:2B:3C:4D:5E:10", "ports": [502]},
            {"role": "vision_camera_1", "hostname": "cell-b-cam1", "ip": "10.30.0.20", "mac": "00:2B:3C:4D:5E:20", "ports": [3956]},
            {"role": "vision_camera_2", "hostname": "cell-b-cam2", "ip": "10.30.0.21", "mac": "00:2B:3C:4D:5E:21", "ports": [3956]},
            {"role": "vision_pc", "hostname": "cell-b-vpc", "ip": "10.30.0.50", "mac": "00:2B:3C:4D:5E:50", "ports": [5000]},
            {"role": "plc", "hostname": "cell-b-plc", "ip": "10.30.0.30", "mac": "00:2B:3C:4D:5E:30", "ports": [44818]},
        ],
        "notes": "Dedicated NIC on vision PC for camera subnet.",
        "createdAt": ts,
        "updatedAt": ts,
    }
    net_raiv = {
        "id": str(uuid.uuid4()),
        "name": "Raiv Default",
        "description": "Default network configuration for Raiv- series vision-guided work cells",
        "vlanId": 0,
        "subnet": "192.168.0.0/24",
        "gateway": "192.168.0.1",
        "dns": ["192.168.0.1", "8.8.8.8"],
        "components": [
            {"role": "wifi_router", "hostname": "raiv-wifi", "ip": "192.168.0.1", "mac": "00:RA:IV:00:00:01", "ports": [80, 443, 22]},
            {"role": "vpn_switch", "hostname": "raiv-vpn-sw", "ip": "192.168.0.2", "mac": "00:RA:IV:00:00:02", "ports": [22, 161, 1194]},
            {"role": "plc", "hostname": "raiv-plc", "ip": "192.168.0.10", "mac": "00:RA:IV:00:00:10", "ports": [502, 44818]},
            {"role": "hmi", "hostname": "raiv-hmi", "ip": "192.168.0.20", "mac": "00:RA:IV:00:00:20", "ports": [80, 443]},
            {"role": "vision_pc", "hostname": "raiv-vpc", "ip": "192.168.0.30", "mac": "00:RA:IV:00:00:30", "ports": [5000, 8080]},
            {"role": "robot_controller", "hostname": "raiv-robot", "ip": "192.168.0.40", "mac": "00:RA:IV:00:00:40", "ports": [502, 10001]},
        ],
        "notes": "Default layout for Raiv- cells. Wi-Fi router is the gateway (192.168.0.1). VPN switch provides remote OT access. Assign unique hostnames per cell by suffixing the Raiv- cell ID.",
        "createdAt": ts,
        "updatedAt": ts,
    }
    db["networkConfigs"] = [net_a, net_b, net_raiv]

    def pkg(name, version, category, vendor, license_type, hw, path, notes):
        return {
            "id": str(uuid.uuid4()),
            "name": name,
            "version": version,
            "category": category,
            "vendor": vendor,
            "licenseType": license_type,
            "compatibleHardware": hw,
            "installPath": path,
            "notes": notes,
            "createdAt": ts,
            "updatedAt": ts,
        }

    db["softwarePackages"] = [
        pkg("Cognex In-Sight Explorer", "6.4.1", "vision", "Cognex", "node-locked", ["Cognex In-Sight 2800"], r"C:\Program Files\Cognex\In-Sight", "Required for IS2800 job authoring and runtime."),
        pkg("Keyence CV-X Software", "5.2.0", "vision", "Keyence", "USB dongle", ["Keyence CV-X Series"], r"C:\Keyence\CV-X", "Includes pattern match and OCR toolsets."),
        pkg("ABB RobotStudio", "2024.1", "robot", "ABB", "floating", ["ABB IRB 1200 7kg"], r"C:\Program Files\ABB\RobotStudio", "Offline programming and virtual commissioning."),
        pkg("Fanuc Roboguide", "9.40", "robot", "Fanuc", "node-locked", ["Fanuc LR Mate 200iD"], r"C:\Program Files\FANUC\Roboguide", "Includes HandlingPRO option."),
        pkg("Studio 5000 Logix Designer", "36.00", "plc", "Rockwell", "subscription", ["Allen-Bradley CompactLogix 5380"], r"C:\Program Files\Rockwell Software\Studio 5000", "EtherNet/IP AOI library for vision handshake included."),
        pkg("Cell Vision Runtime", "2.1.0", "runtime", "Internal", "internal", ["Advantech IPC-610 Industrial PC"], r"D:\CellRuntime", "Internal orchestrator: trigger, inspect, decide, report."),
        pkg("Halcon Machine Vision", "23.11", "vision", "MVTec", "USB dongle", ["Basler ace2 a2A1920"], r"C:\Program Files\MVTec\HALCON-23.11", "Used for custom deep-learning defect models."),
        pkg("Apera Vue", "1.0", "vision", "Apera AI", "subscription", ["Basler ace2 a2A1920", "Advantech IPC-610 Industrial PC", "Staubli TX2-140"], r"C:\Program Files\Apera\Vue", "AI-powered 3D vision guidance for robotic bin picking and part localization."),
        pkg("CLICK Programming Software", "2.60", "plc", "AutomationDirect", "free", ["CLICK PLC"], r"C:\Program Files\AutomationDirect\CLICK", "Ladder programming and online monitoring for AutomationDirect CLICK PLCs."),
        pkg("C-more HMI Programming Software", "6.80", "hmi", "AutomationDirect", "free", ["C-more EA9 HMI", "C-more Micro"], r"C:\Program Files\AutomationDirect\C-more", "Project development for C-more operator interface panels; pairs with CLICK PLC cells."),
        pkg("FactoryTalk View Machine Edition", "13.00", "hmi", "Rockwell", "subscription", ["Allen-Bradley CompactLogix 5380", "PanelView Plus"], r"C:\Program Files\Rockwell Software\FactoryTalk View", "Machine-level HMI for PanelView and CompactLogix vision cells."),
        pkg("Siemens WinCC Advanced", "V17", "hmi", "Siemens", "license_key", ["Siemens S7-1500", "SIMATIC HMI Comfort Panel"], r"C:\Program Files\Siemens\Automation\Portal V17", "TIA Portal HMI engineering for Comfort Panels and PC-based Runtime."),
        pkg("Ignition Vision Module", "8.1", "hmi", "Inductive Automation", "subscription", ["Advantech IPC-610 Industrial PC"], r"C:\Program Files\Inductive Automation\Ignition", "SCADA/HMI runtime for cell dashboards, alarm displays, and KPI visualization."),
    ]
    by_sw = {p["name"]: p for p in db["softwarePackages"]}

    cell1 = str(uuid.uuid4())
    cell2 = str(uuid.uuid4())
    db["cells"] = [
        {
            "id": cell1,
            "name": "VG-Cell-A01",
            "description": "Pick-and-place with 2D vision guidance for automotive brackets",
            "status": "in_build",
            "customer": "Internal – Line 3",
            "location": "Build Bay 2",
            "inventoryItems": [
                {"inventoryId": by_pn["IRB1200-7/0.7"]["id"], "qty": 1},
                {"inventoryId": by_pn["IS2800-C"]["id"], "qty": 2},
                {"inventoryId": by_pn["LXE300-WHI"]["id"], "qty": 2},
                {"inventoryId": by_pn["5069-L320ER"]["id"], "qty": 1},
                {"inventoryId": by_pn["EGP-40-N-N-B"]["id"], "qty": 1},
                {"inventoryId": by_pn["IPC-610H"]["id"], "qty": 1},
                {"inventoryId": by_pn["IE-2000-8TC-G-E"]["id"], "qty": 1},
            ],
            "networkConfigId": net_a["id"],
            "softwarePackageIds": [
                by_sw["Cognex In-Sight Explorer"]["id"],
                by_sw["ABB RobotStudio"]["id"],
                by_sw["Studio 5000 Logix Designer"]["id"],
                by_sw["Cell Vision Runtime"]["id"],
            ],
            "owner": "engineer",
            "createdAt": ts,
            "updatedAt": ts,
        },
        {
            "id": cell2,
            "name": "VG-Cell-B02",
            "description": "Dual-camera inspection and reject for electronics housing",
            "status": "design",
            "customer": "Acme Electronics",
            "location": "Design Lab",
            "inventoryItems": [
                {"inventoryId": by_pn["LR-MATE-200iD"]["id"], "qty": 1},
                {"inventoryId": by_pn["CV-X400"]["id"], "qty": 2},
                {"inventoryId": by_pn["LDR2-90-SW"]["id"], "qty": 2},
                {"inventoryId": by_pn["6ES7511-1AK02-0AB0"]["id"], "qty": 1},
                {"inventoryId": by_pn["RG2"]["id"], "qty": 1},
                {"inventoryId": by_pn["IPC-610H"]["id"], "qty": 1},
            ],
            "networkConfigId": net_b["id"],
            "softwarePackageIds": [
                by_sw["Keyence CV-X Software"]["id"],
                by_sw["Fanuc Roboguide"]["id"],
                by_sw["Cell Vision Runtime"]["id"],
            ],
            "owner": "engineer",
            "createdAt": ts,
            "updatedAt": ts,
        },
    ]

    def kpi(cell_id, name, unit, target, current, direction, category, notes):
        return {
            "id": str(uuid.uuid4()),
            "cellId": cell_id,
            "name": name,
            "unit": unit,
            "target": target,
            "current": current,
            "direction": direction,
            "category": category,
            "notes": notes,
            "updatedAt": ts,
        }

    db["kpis"] = [
        kpi(cell1, "Cycle Time", "sec", 18, 21.5, "lower_is_better", "throughput", "Target includes vision settle + grasp + place."),
        kpi(cell1, "First Pass Yield", "%", 99.2, 97.8, "higher_is_better", "quality", "Based on vision accept rate after robot place."),
        kpi(cell1, "OEE", "%", 85, 78, "higher_is_better", "efficiency", "Availability × Performance × Quality."),
        kpi(cell1, "Vision False Reject", "%", 0.5, 1.2, "lower_is_better", "quality", "Good parts incorrectly failed by vision."),
        kpi(cell2, "Cycle Time", "sec", 12, 0, "lower_is_better", "throughput", "Design target – not measured yet."),
        kpi(cell2, "Defect Escape Rate", "ppm", 50, 0, "lower_is_better", "quality", "Target for dual-camera inspection stack."),
        kpi(cell2, "Uptime", "%", 95, 0, "higher_is_better", "efficiency", "Planned production hours excluding scheduled maintenance."),
    ]

    write_db(db)
    print("Seeded data/db.json")
    print("  admin / admin123")
    print("  engineer / engineer123")
    print("  viewer / viewer123")


# ── HTTP handler ───────────────────────────────────────────────────
MIME = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".ico": "image/x-icon",
    ".woff2": "font/woff2",
}


class Handler(BaseHTTPRequestHandler):
    server_version = "VisionCellBuilder/1.0"

    def log_message(self, fmt: str, *args: Any) -> None:
        print(f"[{self.log_date_time_string()}] {args[0] if args else fmt}")

    def _read_json(self) -> dict:
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0:
            return {}
        raw = self.rfile.read(length)
        try:
            return json.loads(raw.decode("utf-8") or "{}")
        except json.JSONDecodeError:
            return {}

    def _cookie_token(self) -> Optional[str]:
        raw = self.headers.get("Cookie") or ""
        cookie = SimpleCookie()
        try:
            cookie.load(raw)
        except Exception:
            return None
        morsel = cookie.get(COOKIE_NAME)
        return morsel.value if morsel else None

    def _send(self, status: int, body: Any = None, headers: Optional[dict] = None, raw: Optional[bytes] = None, content_type: str = "application/json") -> None:
        if raw is None:
            payload = json.dumps(body if body is not None else {}).encode("utf-8")
        else:
            payload = raw
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        if headers:
            for k, v in headers.items():
                self.send_header(k, v)
        self.end_headers()
        self.wfile.write(payload)

    def _json(self, status: int, body: dict, headers: Optional[dict] = None) -> None:
        self._send(status, body, headers)

    def _error(self, status: int, message: str) -> None:
        self._json(status, {"error": message})

    def _require_auth(self) -> Optional[dict]:
        user = get_session_user(self._cookie_token())
        if not user:
            self._error(401, "Authentication required")
            return None
        return user

    def _require_write(self, user: dict) -> bool:
        if not can_write(user["role"]):
            self._error(403, "Write access requires engineer or admin role")
            return False
        return True

    def _require_admin(self, user: dict) -> bool:
        if user["role"] != "admin":
            self._error(403, "Insufficient permissions")
            return False
        return True

    def _safe(self, fn) -> None:
        """Run a request handler; never leave the client with an empty reply."""
        try:
            fn()
        except (BrokenPipeError, ConnectionResetError):
            return
        except Exception as exc:  # noqa: BLE001 — last-resort HTTP safety net
            print(f"[error] {self.command} {self.path}: {exc}")
            try:
                self._error(500, "Internal server error")
            except Exception:
                return

    def do_OPTIONS(self) -> None:  # noqa: N802
        self.send_response(204)
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self) -> None:  # noqa: N802
        def handle() -> None:
            parsed = urlparse(self.path)
            path = parsed.path
            qs = parse_qs(parsed.query)

            if path in ("/health", "/api/health") or path.startswith("/api/"):
                return self._route_api("GET", path, qs, None)

            # Static files
            rel = path.lstrip("/") or "index.html"
            if ".." in rel:
                return self._error(400, "Bad path")
            file_path = (PUBLIC / rel).resolve()
            if not str(file_path).startswith(str(PUBLIC.resolve())):
                return self._error(400, "Bad path")
            if not file_path.is_file():
                file_path = PUBLIC / "index.html"
            data = file_path.read_bytes()
            ctype = MIME.get(file_path.suffix.lower(), "application/octet-stream")
            self._send(200, raw=data, content_type=ctype)

        self._safe(handle)

    def do_POST(self) -> None:  # noqa: N802
        def handle() -> None:
            parsed = urlparse(self.path)
            body = self._read_json()
            self._route_api("POST", parsed.path, parse_qs(parsed.query), body)

        self._safe(handle)

    def do_PUT(self) -> None:  # noqa: N802
        def handle() -> None:
            parsed = urlparse(self.path)
            body = self._read_json()
            self._route_api("PUT", parsed.path, parse_qs(parsed.query), body)

        self._safe(handle)

    def do_DELETE(self) -> None:  # noqa: N802
        def handle() -> None:
            parsed = urlparse(self.path)
            self._route_api("DELETE", parsed.path, parse_qs(parsed.query), None)

        self._safe(handle)

    def _route_api(self, method: str, path: str, qs: dict, body: Optional[dict]) -> None:
        body = body or {}

        # Health (no auth — used by Railway healthchecks)
        if method == "GET" and path in ("/api/health", "/health"):
            return self._json(200, {"ok": True, "service": "vision-cell-builder"})

        # Auth routes
        if method == "GET" and path == "/api/me":
            user = get_session_user(self._cookie_token())
            if not user:
                return self._error(401, "Not authenticated")
            return self._json(200, {"user": user})

        if method == "POST" and path == "/api/login":
            username = (body.get("username") or "").strip()
            password = body.get("password") or ""
            if not username or not password:
                return self._error(400, "Username and password required")
            db = read_db()
            user = next(
                (u for u in db["users"] if u["username"].lower() == username.lower()),
                None,
            )
            if not user or not verify_password(password, user["passwordHash"]):
                return self._error(401, "Invalid username or password")
            token = secrets.token_hex(32)
            expires = time.time() + SESSION_TTL
            db["sessions"][token] = {"userId": user["id"], "expiresAt": expires}
            write_db(db)
            cookie = (
                f"{COOKIE_NAME}={token}; Path=/; HttpOnly; SameSite=Lax; "
                f"Max-Age={SESSION_TTL}{'; Secure' if _COOKIE_SECURE else ''}"
            )
            return self._json(200, {"user": sanitize_user(user)}, {"Set-Cookie": cookie})

        if method == "POST" and path == "/api/logout":
            token = self._cookie_token()
            if token:
                db = read_db()
                db["sessions"].pop(token, None)
                write_db(db)
            cookie = (
                f"{COOKIE_NAME}=; Path=/; HttpOnly; Max-Age=0"
                f"{'; Secure' if _COOKIE_SECURE else ''}"
            )
            return self._json(200, {"ok": True}, {"Set-Cookie": cookie})

        if method == "POST" and path == "/api/change-password":
            user = self._require_auth()
            if not user:
                return
            cur = body.get("currentPassword") or ""
            new = body.get("newPassword") or ""
            if not cur or len(str(new)) < 6:
                return self._error(400, "Valid current and new password (min 6 chars) required")
            db = read_db()
            full = next((u for u in db["users"] if u["id"] == user["id"]), None)
            if not full or not verify_password(cur, full["passwordHash"]):
                return self._error(401, "Current password is incorrect")
            full["passwordHash"] = hash_password(new)
            write_db(db)
            return self._json(200, {"ok": True})

        if method == "GET" and path == "/api/users":
            user = self._require_auth()
            if not user or not self._require_admin(user):
                return
            users = [sanitize_user(u) for u in read_db()["users"]]
            return self._json(200, {"users": users})

        if method == "POST" and path == "/api/users":
            user = self._require_auth()
            if not user or not self._require_admin(user):
                return
            username = (body.get("username") or "").strip()
            password = body.get("password") or ""
            display = (body.get("displayName") or "").strip()
            role = body.get("role") if body.get("role") in ("admin", "engineer", "viewer") else "viewer"
            if not username or not password or not display:
                return self._error(400, "username, password, and displayName required")
            db = read_db()
            if any(u["username"].lower() == username.lower() for u in db["users"]):
                return self._error(409, "Username already exists")
            new_user = {
                "id": str(uuid.uuid4()),
                "username": username,
                "displayName": display,
                "role": role,
                "passwordHash": hash_password(password),
                "createdAt": now_iso(),
            }
            db["users"].append(new_user)
            write_db(db)
            return self._json(201, {"user": sanitize_user(new_user)})

        if method == "GET" and path == "/api/dashboard":
            user = self._require_auth()
            if not user:
                return
            db = read_db()
            kpis = db["kpis"]
            on_target = sum(1 for k in kpis if is_on_target(k) and not (k.get("current") == 0 and k.get("category")))
            # Simpler on_target count matching Node:
            on_target = 0
            for k in kpis:
                if k.get("current") == 0:
                    continue
                if is_on_target(k):
                    on_target += 1
            cells_by_status: dict = {}
            for c in db["cells"]:
                cells_by_status[c["status"]] = cells_by_status.get(c["status"], 0) + 1
            inv_by_cat: dict = {}
            for i in db["inventory"]:
                inv_by_cat[i["category"]] = inv_by_cat.get(i["category"], 0) + 1
            recent = sorted(db["cells"], key=lambda c: c.get("updatedAt", ""), reverse=True)[:5]
            return self._json(
                200,
                {
                    "counts": {
                        "inventory": len(db["inventory"]),
                        "networkConfigs": len(db["networkConfigs"]),
                        "softwarePackages": len(db["softwarePackages"]),
                        "cells": len(db["cells"]),
                        "kpis": len(kpis),
                        "users": len(db["users"]),
                    },
                    "cellsByStatus": cells_by_status,
                    "inventoryByCategory": inv_by_cat,
                    "lowStock": [i for i in db["inventory"] if i.get("quantityOnHand", 0) < 3],
                    "kpiSummary": {
                        "total": len(kpis),
                        "onTarget": on_target,
                        "offTarget": len(kpis) - on_target,
                    },
                    "recentCells": recent,
                },
            )

        # Inventory
        m = re.fullmatch(r"/api/inventory(?:/([^/]+))?", path)
        if m:
            item_id = m.group(1)
            if method == "GET" and not item_id:
                user = self._require_auth()
                if not user:
                    return
                items = list(read_db()["inventory"])
                cat = (qs.get("category") or [None])[0]
                q = (qs.get("q") or [None])[0]
                if cat:
                    items = [i for i in items if i["category"] == cat]
                if q:
                    s = q.lower()
                    items = [
                        i
                        for i in items
                        if s in i["name"].lower()
                        or s in i["partNumber"].lower()
                        or s in i["vendor"].lower()
                    ]
                return self._json(200, {"items": items})
            if method == "GET" and item_id:
                user = self._require_auth()
                if not user:
                    return
                item = next((i for i in read_db()["inventory"] if i["id"] == item_id), None)
                if not item:
                    return self._error(404, "Not found")
                return self._json(200, {"item": item})
            if method == "POST" and not item_id:
                user = self._require_auth()
                if not user or not self._require_write(user):
                    return
                for key in ("category", "name", "partNumber", "vendor"):
                    if not body.get(key):
                        return self._error(400, "category, name, partNumber, vendor required")
                qty = float(body.get("quantityOnHand") or 0)
                item = {
                    "id": str(uuid.uuid4()),
                    "category": body["category"],
                    "name": body["name"],
                    "partNumber": body["partNumber"],
                    "vendor": body["vendor"],
                    "quantityOnHand": qty,
                    "unitCost": float(body.get("unitCost") or 0),
                    "specs": body.get("specs") if isinstance(body.get("specs"), dict) else {},
                    "status": body.get("status") or ("available" if qty > 0 else "out_of_stock"),
                    "createdAt": now_iso(),
                    "updatedAt": now_iso(),
                }
                db = read_db()
                db["inventory"].append(item)
                write_db(db)
                return self._json(201, {"item": item})
            if method == "PUT" and item_id:
                user = self._require_auth()
                if not user or not self._require_write(user):
                    return
                db = read_db()
                idx = next((i for i, x in enumerate(db["inventory"]) if x["id"] == item_id), None)
                if idx is None:
                    return self._error(404, "Not found")
                prev = db["inventory"][idx]
                updated = {
                    **prev,
                    "category": body.get("category", prev["category"]),
                    "name": body.get("name", prev["name"]),
                    "partNumber": body.get("partNumber", prev["partNumber"]),
                    "vendor": body.get("vendor", prev["vendor"]),
                    "quantityOnHand": float(body["quantityOnHand"]) if "quantityOnHand" in body else prev["quantityOnHand"],
                    "unitCost": float(body["unitCost"]) if "unitCost" in body else prev["unitCost"],
                    "specs": body["specs"] if "specs" in body else prev.get("specs", {}),
                    "status": body.get("status", prev.get("status")),
                    "updatedAt": now_iso(),
                }
                db["inventory"][idx] = updated
                write_db(db)
                return self._json(200, {"item": updated})
            if method == "DELETE" and item_id:
                user = self._require_auth()
                if not user or not self._require_admin(user):
                    return
                db = read_db()
                refs = [
                    c["name"]
                    for c in db["cells"]
                    for row in (c.get("inventoryItems") or [])
                    if row.get("inventoryId") == item_id
                ]
                if refs:
                    unique = sorted(set(refs))
                    return self._error(
                        409,
                        "Cannot delete: item is used in work cell BOM(s): "
                        + ", ".join(unique[:5])
                        + ("…" if len(unique) > 5 else ""),
                    )
                before = len(db["inventory"])
                db["inventory"] = [i for i in db["inventory"] if i["id"] != item_id]
                if len(db["inventory"]) == before:
                    return self._error(404, "Not found")
                write_db(db)
                return self._json(200, {"ok": True})

        # Network
        m = re.fullmatch(r"/api/network(?:/([^/]+))?", path)
        if m:
            nid = m.group(1)
            if method == "GET" and not nid:
                user = self._require_auth()
                if not user:
                    return
                return self._json(200, {"configs": read_db()["networkConfigs"]})
            if method == "GET" and nid:
                user = self._require_auth()
                if not user:
                    return
                cfg = next((c for c in read_db()["networkConfigs"] if c["id"] == nid), None)
                if not cfg:
                    return self._error(404, "Not found")
                return self._json(200, {"config": cfg})
            if method == "POST" and not nid:
                user = self._require_auth()
                if not user or not self._require_write(user):
                    return
                if not body.get("name") or not body.get("subnet") or not body.get("gateway"):
                    return self._error(400, "name, subnet, and gateway required")
                cfg = {
                    "id": str(uuid.uuid4()),
                    "name": body["name"],
                    "description": body.get("description") or "",
                    "vlanId": int(body.get("vlanId") or 0),
                    "subnet": body["subnet"],
                    "gateway": body["gateway"],
                    "dns": body.get("dns") if isinstance(body.get("dns"), list) else [],
                    "components": body.get("components") if isinstance(body.get("components"), list) else [],
                    "notes": body.get("notes") or "",
                    "createdAt": now_iso(),
                    "updatedAt": now_iso(),
                }
                db = read_db()
                db["networkConfigs"].append(cfg)
                write_db(db)
                return self._json(201, {"config": cfg})
            if method == "PUT" and nid:
                user = self._require_auth()
                if not user or not self._require_write(user):
                    return
                db = read_db()
                idx = next((i for i, x in enumerate(db["networkConfigs"]) if x["id"] == nid), None)
                if idx is None:
                    return self._error(404, "Not found")
                prev = db["networkConfigs"][idx]
                updated = {
                    **prev,
                    "name": body.get("name", prev["name"]),
                    "description": body.get("description", prev.get("description", "")),
                    "vlanId": int(body["vlanId"]) if "vlanId" in body else prev.get("vlanId", 0),
                    "subnet": body.get("subnet", prev["subnet"]),
                    "gateway": body.get("gateway", prev["gateway"]),
                    "dns": body["dns"] if "dns" in body else prev.get("dns", []),
                    "components": body["components"] if "components" in body else prev.get("components", []),
                    "notes": body.get("notes", prev.get("notes", "")),
                    "updatedAt": now_iso(),
                }
                db["networkConfigs"][idx] = updated
                write_db(db)
                return self._json(200, {"config": updated})
            if method == "DELETE" and nid:
                user = self._require_auth()
                if not user or not self._require_admin(user):
                    return
                db = read_db()
                before = len(db["networkConfigs"])
                db["networkConfigs"] = [c for c in db["networkConfigs"] if c["id"] != nid]
                if len(db["networkConfigs"]) == before:
                    return self._error(404, "Not found")
                write_db(db)
                return self._json(200, {"ok": True})

        # Software
        m = re.fullmatch(r"/api/software(?:/([^/]+))?", path)
        if m:
            sid = m.group(1)
            if method == "GET" and not sid:
                user = self._require_auth()
                if not user:
                    return
                packages = list(read_db()["softwarePackages"])
                cat = (qs.get("category") or [None])[0]
                q = (qs.get("q") or [None])[0]
                if cat:
                    packages = [p for p in packages if p["category"] == cat]
                if q:
                    s = q.lower()
                    packages = [
                        p
                        for p in packages
                        if s in p["name"].lower() or s in p["vendor"].lower() or s in p["version"].lower()
                    ]
                return self._json(200, {"packages": packages})
            if method == "POST" and not sid:
                user = self._require_auth()
                if not user or not self._require_write(user):
                    return
                for key in ("name", "version", "category", "vendor"):
                    if not body.get(key):
                        return self._error(400, "name, version, category, vendor required")
                pkg = {
                    "id": str(uuid.uuid4()),
                    "name": body["name"],
                    "version": body["version"],
                    "category": body["category"],
                    "vendor": body["vendor"],
                    "licenseType": body.get("licenseType") or "",
                    "compatibleHardware": body.get("compatibleHardware")
                    if isinstance(body.get("compatibleHardware"), list)
                    else [],
                    "installPath": body.get("installPath") or "",
                    "notes": body.get("notes") or "",
                    "createdAt": now_iso(),
                    "updatedAt": now_iso(),
                }
                db = read_db()
                db["softwarePackages"].append(pkg)
                write_db(db)
                return self._json(201, {"package": pkg})
            if method == "PUT" and sid:
                user = self._require_auth()
                if not user or not self._require_write(user):
                    return
                db = read_db()
                idx = next((i for i, x in enumerate(db["softwarePackages"]) if x["id"] == sid), None)
                if idx is None:
                    return self._error(404, "Not found")
                prev = db["softwarePackages"][idx]
                updated = {
                    **prev,
                    "name": body.get("name", prev["name"]),
                    "version": body.get("version", prev["version"]),
                    "category": body.get("category", prev["category"]),
                    "vendor": body.get("vendor", prev["vendor"]),
                    "licenseType": body.get("licenseType", prev.get("licenseType", "")),
                    "compatibleHardware": body["compatibleHardware"]
                    if "compatibleHardware" in body
                    else prev.get("compatibleHardware", []),
                    "installPath": body.get("installPath", prev.get("installPath", "")),
                    "notes": body.get("notes", prev.get("notes", "")),
                    "updatedAt": now_iso(),
                }
                db["softwarePackages"][idx] = updated
                write_db(db)
                return self._json(200, {"package": updated})
            if method == "DELETE" and sid:
                user = self._require_auth()
                if not user or not self._require_admin(user):
                    return
                db = read_db()
                before = len(db["softwarePackages"])
                db["softwarePackages"] = [p for p in db["softwarePackages"] if p["id"] != sid]
                if len(db["softwarePackages"]) == before:
                    return self._error(404, "Not found")
                write_db(db)
                return self._json(200, {"ok": True})

        # Cells
        m = re.fullmatch(r"/api/cells(?:/([^/]+))?", path)
        if m:
            cid = m.group(1)
            if method == "GET" and not cid:
                user = self._require_auth()
                if not user:
                    return
                db = read_db()
                cells = [enrich_cell(c, db) for c in db["cells"]]
                return self._json(200, {"cells": cells})
            if method == "GET" and cid:
                user = self._require_auth()
                if not user:
                    return
                db = read_db()
                cell = next((c for c in db["cells"] if c["id"] == cid), None)
                if not cell:
                    return self._error(404, "Not found")
                kpis = [k for k in db["kpis"] if k.get("cellId") == cid]
                return self._json(200, {"cell": enrich_cell(cell, db), "kpis": kpis})
            if method == "POST" and not cid:
                user = self._require_auth()
                if not user or not self._require_write(user):
                    return
                if not body.get("name"):
                    return self._error(400, "name required")
                cell = {
                    "id": str(uuid.uuid4()),
                    "name": body["name"],
                    "description": body.get("description") or "",
                    "status": body.get("status") or "design",
                    "customer": body.get("customer") or "",
                    "location": body.get("location") or "",
                    "inventoryItems": body.get("inventoryItems")
                    if isinstance(body.get("inventoryItems"), list)
                    else [],
                    "networkConfigId": body.get("networkConfigId") or None,
                    "softwarePackageIds": body.get("softwarePackageIds")
                    if isinstance(body.get("softwarePackageIds"), list)
                    else [],
                    "owner": user["username"],
                    "createdAt": now_iso(),
                    "updatedAt": now_iso(),
                }
                db = read_db()
                db["cells"].append(cell)
                write_db(db)
                return self._json(201, {"cell": enrich_cell(cell, read_db())})
            if method == "PUT" and cid:
                user = self._require_auth()
                if not user or not self._require_write(user):
                    return
                db = read_db()
                idx = next((i for i, x in enumerate(db["cells"]) if x["id"] == cid), None)
                if idx is None:
                    return self._error(404, "Not found")
                prev = db["cells"][idx]
                updated = {
                    **prev,
                    "name": body.get("name", prev["name"]),
                    "description": body.get("description", prev.get("description", "")),
                    "status": body.get("status", prev.get("status")),
                    "customer": body.get("customer", prev.get("customer", "")),
                    "location": body.get("location", prev.get("location", "")),
                    "inventoryItems": body["inventoryItems"]
                    if "inventoryItems" in body
                    else prev.get("inventoryItems", []),
                    "networkConfigId": body["networkConfigId"]
                    if "networkConfigId" in body
                    else prev.get("networkConfigId"),
                    "softwarePackageIds": body["softwarePackageIds"]
                    if "softwarePackageIds" in body
                    else prev.get("softwarePackageIds", []),
                    "updatedAt": now_iso(),
                }
                db["cells"][idx] = updated
                write_db(db)
                return self._json(200, {"cell": enrich_cell(updated, read_db())})
            if method == "DELETE" and cid:
                user = self._require_auth()
                if not user or not self._require_admin(user):
                    return
                db = read_db()
                before = len(db["cells"])
                db["cells"] = [c for c in db["cells"] if c["id"] != cid]
                db["kpis"] = [k for k in db["kpis"] if k.get("cellId") != cid]
                if len(db["cells"]) == before:
                    return self._error(404, "Not found")
                write_db(db)
                return self._json(200, {"ok": True})

        # KPIs
        m = re.fullmatch(r"/api/kpis(?:/([^/]+))?", path)
        if m:
            kid = m.group(1)
            if method == "GET" and not kid:
                user = self._require_auth()
                if not user:
                    return
                db = read_db()
                kpis = list(db["kpis"])
                cell_id = (qs.get("cellId") or [None])[0]
                if cell_id:
                    kpis = [k for k in kpis if k.get("cellId") == cell_id]
                cell_names = {c["id"]: c["name"] for c in db["cells"]}
                enriched = [
                    {
                        **k,
                        "cellName": cell_names.get(k.get("cellId"), "Unknown"),
                        "onTarget": is_on_target(k),
                    }
                    for k in kpis
                ]
                return self._json(200, {"kpis": enriched})
            if method == "POST" and not kid:
                user = self._require_auth()
                if not user or not self._require_write(user):
                    return
                if not body.get("cellId") or not body.get("name") or body.get("target") is None:
                    return self._error(400, "cellId, name, and target required")
                db = read_db()
                if not any(c["id"] == body["cellId"] for c in db["cells"]):
                    return self._error(400, "Invalid cellId")
                kpi = {
                    "id": str(uuid.uuid4()),
                    "cellId": body["cellId"],
                    "name": body["name"],
                    "unit": body.get("unit") or "",
                    "target": float(body["target"]),
                    "current": float(body.get("current") or 0),
                    "direction": "lower_is_better"
                    if body.get("direction") == "lower_is_better"
                    else "higher_is_better",
                    "category": body.get("category") or "general",
                    "notes": body.get("notes") or "",
                    "updatedAt": now_iso(),
                }
                db["kpis"].append(kpi)
                write_db(db)
                return self._json(201, {"kpi": {**kpi, "onTarget": is_on_target(kpi)}})
            if method == "PUT" and kid:
                user = self._require_auth()
                if not user or not self._require_write(user):
                    return
                db = read_db()
                idx = next((i for i, x in enumerate(db["kpis"]) if x["id"] == kid), None)
                if idx is None:
                    return self._error(404, "Not found")
                prev = db["kpis"][idx]
                updated = {
                    **prev,
                    "name": body.get("name", prev["name"]),
                    "unit": body.get("unit", prev.get("unit", "")),
                    "target": float(body["target"]) if "target" in body else prev["target"],
                    "current": float(body["current"]) if "current" in body else prev["current"],
                    "direction": body.get("direction", prev.get("direction")),
                    "category": body.get("category", prev.get("category")),
                    "notes": body.get("notes", prev.get("notes", "")),
                    "cellId": body.get("cellId", prev["cellId"]),
                    "updatedAt": now_iso(),
                }
                db["kpis"][idx] = updated
                write_db(db)
                return self._json(200, {"kpi": {**updated, "onTarget": is_on_target(updated)}})
            if method == "DELETE" and kid:
                user = self._require_auth()
                if not user or not self._require_write(user):
                    return
                db = read_db()
                before = len(db["kpis"])
                db["kpis"] = [k for k in db["kpis"] if k["id"] != kid]
                if len(db["kpis"]) == before:
                    return self._error(404, "Not found")
                write_db(db)
                return self._json(200, {"ok": True})

        self._error(404, "Not found")


def main() -> None:
    ensure_db()
    # Re-seed if empty users (corrupt/empty file)
    db = read_db()
    if not db.get("users"):
        seed_database()

    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"Vision Cell Builder running at http://{HOST}:{PORT}")
    print("Demo logins: admin/admin123  engineer/engineer123  viewer/viewer123")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down.")
        server.server_close()


if __name__ == "__main__":
    main()
