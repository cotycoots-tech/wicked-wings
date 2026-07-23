const bcrypt = require('bcryptjs');
const { v4: uuid } = require('uuid');
const { write, defaultDb } = require('./store');

async function seed() {
  const db = defaultDb();
  const now = new Date().toISOString();

  db.users = [
    {
      id: uuid(),
      username: 'admin',
      displayName: 'System Admin',
      role: 'admin',
      passwordHash: await bcrypt.hash('admin123', 10),
      createdAt: now
    },
    {
      id: uuid(),
      username: 'engineer',
      displayName: 'Cell Engineer',
      role: 'engineer',
      passwordHash: await bcrypt.hash('engineer123', 10),
      createdAt: now
    },
    {
      id: uuid(),
      username: 'viewer',
      displayName: 'Operations Viewer',
      role: 'viewer',
      passwordHash: await bcrypt.hash('viewer123', 10),
      createdAt: now
    }
  ];

  const inv = (category, name, partNumber, vendor, qty, unitCost, specs) => ({
    id: uuid(),
    category,
    name,
    partNumber,
    vendor,
    quantityOnHand: qty,
    unitCost,
    specs,
    status: qty > 0 ? 'available' : 'out_of_stock',
    createdAt: now,
    updatedAt: now
  });

  db.inventory = [
    inv('robot', 'ABB IRB 1200 7kg', 'IRB1200-7/0.7', 'ABB', 4, 28500, {
      payloadKg: 7,
      reachMm: 700,
      axes: 6,
      interface: 'EtherNet/IP'
    }),
    inv('robot', 'Fanuc LR Mate 200iD', 'LR-MATE-200iD', 'Fanuc', 3, 32000, {
      payloadKg: 7,
      reachMm: 717,
      axes: 6,
      interface: 'EtherNet/IP'
    }),
    inv('robot', 'Staubli TX2-140', 'TX2-140', 'Staubli', 2, 45000, {
      payloadKg: 40,
      reachMm: 1510,
      axes: 6,
      interface: 'EtherCAT/EtherNet/IP'
    }),
    inv('camera', 'Cognex In-Sight 2800', 'IS2800-C', 'Cognex', 12, 4200, {
      resolution: '1440x1080',
      interface: 'GigE',
      lighting: 'integrated'
    }),
    inv('camera', 'Keyence CV-X Series', 'CV-X400', 'Keyence', 8, 5600, {
      resolution: '2048x1536',
      interface: 'GigE',
      lighting: 'external'
    }),
    inv('camera', 'Basler ace2 a2A1920', 'a2A1920-51gc', 'Basler', 15, 890, {
      resolution: '1920x1200',
      interface: 'GigE',
      fps: 51
    }),
    inv('camera', 'IDS GV-51F0FA-M-GL', 'GV-51F0FA-M-GL', 'IDS Imaging', 2, 1450, {
      type: 'GigE industrial camera',
      spectrum: 'Monochrome',
      sensor: 'Sony IMX547',
      shutter: 'Global shutter',
      resolution: '2472 x 2064',
      megapixels: 5.1,
      sensorFormat: '1/1.8"',
      interface: 'GigE Vision',
      interfaceSpeed: '1 Gbps',
      fps: 24.7,
      ipRating: 'IP69K',
      series: 'uEye FA',
      mount: 'C-mount'
    }),
    inv('lighting', 'Smart Vision Lights LXE300', 'LXE300-WHI', 'SVL', 20, 450, {
      color: 'white',
      type: 'bar',
      voltage: '24VDC'
    }),
    inv('lighting', 'CCS LDR2 Ring Light', 'LDR2-90-SW', 'CCS', 10, 380, {
      color: 'white',
      type: 'ring',
      voltage: '24VDC'
    }),
    inv('plc', 'Allen-Bradley CompactLogix 5380', '5069-L320ER', 'Rockwell', 6, 3100, {
      ioPoints: 32,
      ethernetPorts: 2,
      memoryMb: 2
    }),
    inv('plc', 'Siemens S7-1500', '6ES7511-1AK02-0AB0', 'Siemens', 4, 2800, {
      ioPoints: 16,
      ethernetPorts: 2,
      memoryMb: 1
    }),
    inv('gripper', 'Schunk EGP 40', 'EGP-40-N-N-B', 'Schunk', 14, 1200, {
      strokeMm: 6,
      forceN: 140,
      interface: 'digital'
    }),
    inv('gripper', 'Schunk EGM-M-Q-50-1-FX', 'EGM-M-Q-50-1-FX', 'Schunk', 4, 2800, {
      type: 'magnetic_gripper',
      series: 'EGM',
      manufacturerId: '306351',
      magnetType: 'Monopole',
      poleForm: 'square',
      poleWidthMm: 50,
      numberOfPoles: 2,
      magnetAreaCm2: 50.4,
      weightKg: 3.45,
      minWorkpieceThicknessMm: 12,
      payloadHorizontalKg: 80,
      payloadVerticalKg: 32,
      maxActivationsPerMin: 6,
      ipProtectionClass: 'IP54',
      magneticCircuitA: 2.3,
      cableLengthCm: 30,
      diameterDMm: 98,
      heightZMm: 65,
      magnetControllerType: 'ECG 02',
      nominalVoltageVac: 400,
      maxCurrentA: 32,
      communicationInterface: 'digital I/O',
      maxAmbientTempC: 50,
      housingMaterial: 'Steel',
      actuation: 'Electrical current pulse (electro-permanent magnet)'
    }),
    inv('gripper', 'Schunk EMH-RP 084-B', 'EMH-RP-084-B', 'Schunk', 0, 0, {
      type: 'magnetic_gripper',
      series: 'EMH',
      size: 'RP 084',
      manufacturerId: '1351496',
      holdingForceN: 5370,
      magnetAreaCm2: 41.25,
      payloadHorizontalKg: 89,
      payloadVerticalKg: 35,
      activationTimeMs: 500,
      minAmbientTempC: 5,
      maxAmbientTempC: 50,
      weightKg: 6.5,
      ipProtectionClass: 'IP52',
      nominalVoltageV: 24,
      voltageType: 'DC',
      maxCurrentA: 6.1,
      ratedCurrentLogicA: 0.15,
      controllerElectronics: 'integrated',
      lengthXMm: 128,
      widthYMm: 128,
      heightZMm: 157,
      housingMaterial: 'Aluminum/steel',
      actuation: 'Electrical current pulse (electro-permanent magnet)'
    }),
    inv('gripper', 'OnRobot RG2', 'RG2', 'OnRobot', 7, 4500, {
      strokeMm: 110,
      forceN: 40,
      interface: 'tool_flange'
    }),
    inv('conveyor', 'Dorner 2200 Series', '2200-12-60', 'Dorner', 5, 3800, {
      widthIn: 12,
      lengthIn: 60,
      speedFpm: 100
    }),
    inv('lens', 'Computar 12mm C-Mount', 'M1214-MP2', 'Computar', 25, 145, {
      focalLengthMm: 12,
      mount: 'C',
      aperture: 'f1.4'
    }),
    inv('lens', 'Lens 8mm C-Mount', 'EO-8MM-CM', 'Edmund Optics', 10, 195, {
      focalLengthMm: 8,
      mount: 'C',
      type: 'fixed_focal'
    }),
    inv('lens', 'Lens 4mm C-Mount', 'EO-4MM-CM', 'Edmund Optics', 10, 185, {
      focalLengthMm: 4,
      mount: 'C',
      type: 'fixed_focal'
    }),
    inv('network', 'Cisco IE-2000 Switch', 'IE-2000-8TC-G-E', 'Cisco', 9, 1800, {
      ports: 8,
      managed: true,
      industrial: true
    }),
    inv('pc', 'Advantech IPC-610 Industrial PC', 'IPC-610H', 'Advantech', 6, 2200, {
      cpu: 'i7-12700',
      ramGb: 32,
      storage: '1TB SSD'
    }),
    inv('pc', 'Dell Precision 3460', 'Precision-3460-SFF', 'Dell', 1, 1850, {
      formFactor: 'SFF',
      series: 'Precision 3460',
      cpu: 'Intel Core i7-12700 (12th Gen, 12 cores)',
      chipset: 'Intel W680',
      ramGb: 32,
      ramType: 'DDR5 SODIMM',
      storage: '512GB NVMe SSD',
      gpu: 'NVIDIA T1000 8GB (optional discrete)',
      os: 'Windows 11 Pro',
      ethernet: '1x 1GbE RJ-45',
      ports: 'USB 3.2, DisplayPort 1.4, HDMI, audio',
      powerSupplyW: 300,
      assetTag: '0418',
      suppliedBy: 'Apera',
      use: 'vision_pc'
    })
  ];

  db.networkConfigs = [
    {
      id: uuid(),
      name: 'Cell A Standard VLAN',
      description: 'Default vision cell network for Cell A builds',
      vlanId: 120,
      subnet: '192.168.120.0/24',
      gateway: '192.168.120.1',
      dns: ['192.168.1.10', '8.8.8.8'],
      components: [
        { role: 'robot_controller', hostname: 'cell-a-robot', ip: '192.168.120.10', mac: '00:1A:2B:3C:4D:10', ports: [502, 44818] },
        { role: 'vision_camera_1', hostname: 'cell-a-cam1', ip: '192.168.120.20', mac: '00:1A:2B:3C:4D:20', ports: [3956] },
        { role: 'vision_camera_2', hostname: 'cell-a-cam2', ip: '192.168.120.21', mac: '00:1A:2B:3C:4D:21', ports: [3956] },
        { role: 'plc', hostname: 'cell-a-plc', ip: '192.168.120.30', mac: '00:1A:2B:3C:4D:30', ports: [44818, 2222] },
        { role: 'hmi', hostname: 'cell-a-hmi', ip: '192.168.120.40', mac: '00:1A:2B:3C:4D:40', ports: [80, 443] },
        { role: 'vision_pc', hostname: 'cell-a-vpc', ip: '192.168.120.50', mac: '00:1A:2B:3C:4D:50', ports: [5000, 8080] },
        { role: 'managed_switch', hostname: 'cell-a-sw1', ip: '192.168.120.2', mac: '00:1A:2B:3C:4D:02', ports: [22, 161] }
      ],
      notes: 'Isolated OT VLAN. No internet egress except through jump host.',
      createdAt: now,
      updatedAt: now
    },
    {
      id: uuid(),
      name: 'Cell B Dual-Camera GigE',
      description: 'High-bandwidth GigE vision segment for dual camera inspection',
      vlanId: 130,
      subnet: '10.30.0.0/24',
      gateway: '10.30.0.1',
      dns: ['10.0.0.10'],
      components: [
        { role: 'robot_controller', hostname: 'cell-b-robot', ip: '10.30.0.10', mac: '00:2B:3C:4D:5E:10', ports: [502] },
        { role: 'vision_camera_1', hostname: 'cell-b-cam1', ip: '10.30.0.20', mac: '00:2B:3C:4D:5E:20', ports: [3956] },
        { role: 'vision_camera_2', hostname: 'cell-b-cam2', ip: '10.30.0.21', mac: '00:2B:3C:4D:5E:21', ports: [3956] },
        { role: 'vision_pc', hostname: 'cell-b-vpc', ip: '10.30.0.50', mac: '00:2B:3C:4D:5E:50', ports: [5000] },
        { role: 'plc', hostname: 'cell-b-plc', ip: '10.30.0.30', mac: '00:2B:3C:4D:5E:30', ports: [44818] }
      ],
      notes: 'Dedicated NIC on vision PC for camera subnet.',
      createdAt: now,
      updatedAt: now
    },
    {
      id: uuid(),
      name: 'Raiv Default',
      description: 'Default network configuration for Raiv- series vision-guided work cells',
      vlanId: 0,
      subnet: '192.168.0.0/24',
      gateway: '192.168.0.1',
      dns: ['192.168.0.1', '8.8.8.8'],
      components: [
        { role: 'wifi_router', hostname: 'raiv-wifi', ip: '192.168.0.1', mac: '00:RA:IV:00:00:01', ports: [80, 443, 22] },
        { role: 'vpn_switch', hostname: 'raiv-vpn-sw', ip: '192.168.0.2', mac: '00:RA:IV:00:00:02', ports: [22, 161, 1194] },
        { role: 'plc', hostname: 'raiv-plc', ip: '192.168.0.10', mac: '00:RA:IV:00:00:10', ports: [502, 44818] },
        { role: 'hmi', hostname: 'raiv-hmi', ip: '192.168.0.20', mac: '00:RA:IV:00:00:20', ports: [80, 443] },
        { role: 'vision_pc', hostname: 'raiv-vpc', ip: '192.168.0.30', mac: '00:RA:IV:00:00:30', ports: [5000, 8080] },
        { role: 'robot_controller', hostname: 'raiv-robot', ip: '192.168.0.40', mac: '00:RA:IV:00:00:40', ports: [502, 10001] }
      ],
      notes:
        'Default layout for Raiv- cells. Wi-Fi router is the gateway (192.168.0.1). VPN switch provides remote OT access. Assign unique hostnames per cell by suffixing the Raiv- cell ID.',
      createdAt: now,
      updatedAt: now
    }
  ];

  db.softwarePackages = [
    {
      id: uuid(),
      name: 'Cognex In-Sight Explorer',
      version: '6.4.1',
      category: 'vision',
      vendor: 'Cognex',
      licenseType: 'node-locked',
      compatibleHardware: ['Cognex In-Sight 2800'],
      installPath: 'C:\\Program Files\\Cognex\\In-Sight',
      notes: 'Required for IS2800 job authoring and runtime.',
      createdAt: now,
      updatedAt: now
    },
    {
      id: uuid(),
      name: 'Keyence CV-X Software',
      version: '5.2.0',
      category: 'vision',
      vendor: 'Keyence',
      licenseType: 'USB dongle',
      compatibleHardware: ['Keyence CV-X Series'],
      installPath: 'C:\\Keyence\\CV-X',
      notes: 'Includes pattern match and OCR toolsets.',
      createdAt: now,
      updatedAt: now
    },
    {
      id: uuid(),
      name: 'ABB RobotStudio',
      version: '2024.1',
      category: 'robot',
      vendor: 'ABB',
      licenseType: 'floating',
      compatibleHardware: ['ABB IRB 1200 7kg'],
      installPath: 'C:\\Program Files\\ABB\\RobotStudio',
      notes: 'Offline programming and virtual commissioning.',
      createdAt: now,
      updatedAt: now
    },
    {
      id: uuid(),
      name: 'Fanuc Roboguide',
      version: '9.40',
      category: 'robot',
      vendor: 'Fanuc',
      licenseType: 'node-locked',
      compatibleHardware: ['Fanuc LR Mate 200iD'],
      installPath: 'C:\\Program Files\\FANUC\\Roboguide',
      notes: 'Includes HandlingPRO option.',
      createdAt: now,
      updatedAt: now
    },
    {
      id: uuid(),
      name: 'Studio 5000 Logix Designer',
      version: '36.00',
      category: 'plc',
      vendor: 'Rockwell',
      licenseType: 'subscription',
      compatibleHardware: ['Allen-Bradley CompactLogix 5380'],
      installPath: 'C:\\Program Files\\Rockwell Software\\Studio 5000',
      notes: 'EtherNet/IP AOI library for vision handshake included.',
      createdAt: now,
      updatedAt: now
    },
    {
      id: uuid(),
      name: 'Cell Vision Runtime',
      version: '2.1.0',
      category: 'runtime',
      vendor: 'Internal',
      licenseType: 'internal',
      compatibleHardware: ['Advantech IPC-610 Industrial PC'],
      installPath: 'D:\\CellRuntime',
      notes: 'Internal orchestrator: trigger, inspect, decide, report.',
      createdAt: now,
      updatedAt: now
    },
    {
      id: uuid(),
      name: 'Halcon Machine Vision',
      version: '23.11',
      category: 'vision',
      vendor: 'MVTec',
      licenseType: 'USB dongle',
      compatibleHardware: ['Basler ace2 a2A1920'],
      installPath: 'C:\\Program Files\\MVTec\\HALCON-23.11',
      notes: 'Used for custom deep-learning defect models.',
      createdAt: now,
      updatedAt: now
    },
    {
      id: uuid(),
      name: 'Apera Vue',
      version: '1.0',
      category: 'vision',
      vendor: 'Apera AI',
      licenseType: 'subscription',
      compatibleHardware: [
        'Basler ace2 a2A1920',
        'Advantech IPC-610 Industrial PC',
        'Staubli TX2-140'
      ],
      installPath: 'C:\\Program Files\\Apera\\Vue',
      notes: 'AI-powered 3D vision guidance for robotic bin picking and part localization.',
      createdAt: now,
      updatedAt: now
    },
    {
      id: uuid(),
      name: 'CLICK Programming Software',
      version: '2.60',
      category: 'plc',
      vendor: 'AutomationDirect',
      licenseType: 'free',
      compatibleHardware: ['CLICK PLC'],
      installPath: 'C:\\Program Files\\AutomationDirect\\CLICK',
      notes: 'Ladder programming and online monitoring for AutomationDirect CLICK PLCs.',
      createdAt: now,
      updatedAt: now
    },
    {
      id: uuid(),
      name: 'C-more HMI Programming Software',
      version: '6.80',
      category: 'hmi',
      vendor: 'AutomationDirect',
      licenseType: 'free',
      compatibleHardware: ['C-more EA9 HMI', 'C-more Micro'],
      installPath: 'C:\\Program Files\\AutomationDirect\\C-more',
      notes: 'Project development for C-more operator interface panels; pairs with CLICK PLC cells.',
      createdAt: now,
      updatedAt: now
    },
    {
      id: uuid(),
      name: 'FactoryTalk View Machine Edition',
      version: '13.00',
      category: 'hmi',
      vendor: 'Rockwell',
      licenseType: 'subscription',
      compatibleHardware: ['Allen-Bradley CompactLogix 5380', 'PanelView Plus'],
      installPath: 'C:\\Program Files\\Rockwell Software\\FactoryTalk View',
      notes: 'Machine-level HMI for PanelView and CompactLogix vision cells.',
      createdAt: now,
      updatedAt: now
    },
    {
      id: uuid(),
      name: 'Siemens WinCC Advanced',
      version: 'V17',
      category: 'hmi',
      vendor: 'Siemens',
      licenseType: 'license_key',
      compatibleHardware: ['Siemens S7-1500', 'SIMATIC HMI Comfort Panel'],
      installPath: 'C:\\Program Files\\Siemens\\Automation\\Portal V17',
      notes: 'TIA Portal HMI engineering for Comfort Panels and PC-based Runtime.',
      createdAt: now,
      updatedAt: now
    },
    {
      id: uuid(),
      name: 'Ignition Vision Module',
      version: '8.1',
      category: 'hmi',
      vendor: 'Inductive Automation',
      licenseType: 'subscription',
      compatibleHardware: ['Advantech IPC-610 Industrial PC'],
      installPath: 'C:\\Program Files\\Inductive Automation\\Ignition',
      notes: 'SCADA/HMI runtime for cell dashboards, alarm displays, and KPI visualization.',
      createdAt: now,
      updatedAt: now
    }
  ];

  const robotAbb = db.inventory.find((i) => i.partNumber === 'IRB1200-7/0.7');
  const camCognex = db.inventory.find((i) => i.partNumber === 'IS2800-C');
  const light = db.inventory.find((i) => i.partNumber === 'LXE300-WHI');
  const plc = db.inventory.find((i) => i.partNumber === '5069-L320ER');
  const grip = db.inventory.find((i) => i.partNumber === 'EGP-40-N-N-B');
  const pc = db.inventory.find((i) => i.partNumber === 'IPC-610H');
  const sw = db.inventory.find((i) => i.partNumber === 'IE-2000-8TC-G-E');
  const netA = db.networkConfigs[0];
  const pkgs = db.softwarePackages.filter((p) =>
    ['Cognex In-Sight Explorer', 'ABB RobotStudio', 'Studio 5000 Logix Designer', 'Cell Vision Runtime'].includes(p.name)
  );

  const cell1Id = uuid();
  const cell2Id = uuid();

  db.cells = [
    {
      id: cell1Id,
      name: 'VG-Cell-A01',
      description: 'Pick-and-place with 2D vision guidance for automotive brackets',
      status: 'in_build',
      customer: 'Internal – Line 3',
      location: 'Build Bay 2',
      inventoryItems: [
        { inventoryId: robotAbb.id, qty: 1 },
        { inventoryId: camCognex.id, qty: 2 },
        { inventoryId: light.id, qty: 2 },
        { inventoryId: plc.id, qty: 1 },
        { inventoryId: grip.id, qty: 1 },
        { inventoryId: pc.id, qty: 1 },
        { inventoryId: sw.id, qty: 1 }
      ],
      networkConfigId: netA.id,
      softwarePackageIds: pkgs.map((p) => p.id),
      owner: 'engineer',
      createdAt: now,
      updatedAt: now
    },
    {
      id: cell2Id,
      name: 'VG-Cell-B02',
      description: 'Dual-camera inspection and reject for electronics housing',
      status: 'design',
      customer: 'Acme Electronics',
      location: 'Design Lab',
      inventoryItems: [
        { inventoryId: db.inventory.find((i) => i.partNumber === 'LR-MATE-200iD').id, qty: 1 },
        { inventoryId: db.inventory.find((i) => i.partNumber === 'CV-X400').id, qty: 2 },
        { inventoryId: db.inventory.find((i) => i.partNumber === 'LDR2-90-SW').id, qty: 2 },
        { inventoryId: db.inventory.find((i) => i.partNumber === '6ES7511-1AK02-0AB0').id, qty: 1 },
        { inventoryId: db.inventory.find((i) => i.partNumber === 'RG2').id, qty: 1 },
        { inventoryId: pc.id, qty: 1 }
      ],
      networkConfigId: db.networkConfigs[1].id,
      softwarePackageIds: db.softwarePackages
        .filter((p) => ['Keyence CV-X Software', 'Fanuc Roboguide', 'Cell Vision Runtime'].includes(p.name))
        .map((p) => p.id),
      owner: 'engineer',
      createdAt: now,
      updatedAt: now
    }
  ];

  db.kpis = [
    {
      id: uuid(),
      cellId: cell1Id,
      name: 'Cycle Time',
      unit: 'sec',
      target: 18,
      current: 21.5,
      direction: 'lower_is_better',
      category: 'throughput',
      notes: 'Target includes vision settle + grasp + place.',
      updatedAt: now
    },
    {
      id: uuid(),
      cellId: cell1Id,
      name: 'First Pass Yield',
      unit: '%',
      target: 99.2,
      current: 97.8,
      direction: 'higher_is_better',
      category: 'quality',
      notes: 'Based on vision accept rate after robot place.',
      updatedAt: now
    },
    {
      id: uuid(),
      cellId: cell1Id,
      name: 'OEE',
      unit: '%',
      target: 85,
      current: 78,
      direction: 'higher_is_better',
      category: 'efficiency',
      notes: 'Availability × Performance × Quality.',
      updatedAt: now
    },
    {
      id: uuid(),
      cellId: cell1Id,
      name: 'Vision False Reject',
      unit: '%',
      target: 0.5,
      current: 1.2,
      direction: 'lower_is_better',
      category: 'quality',
      notes: 'Good parts incorrectly failed by vision.',
      updatedAt: now
    },
    {
      id: uuid(),
      cellId: cell2Id,
      name: 'Cycle Time',
      unit: 'sec',
      target: 12,
      current: 0,
      direction: 'lower_is_better',
      category: 'throughput',
      notes: 'Design target – not measured yet.',
      updatedAt: now
    },
    {
      id: uuid(),
      cellId: cell2Id,
      name: 'Defect Escape Rate',
      unit: 'ppm',
      target: 50,
      current: 0,
      direction: 'lower_is_better',
      category: 'quality',
      notes: 'Target for dual-camera inspection stack.',
      updatedAt: now
    },
    {
      id: uuid(),
      cellId: cell2Id,
      name: 'Uptime',
      unit: '%',
      target: 95,
      current: 0,
      direction: 'higher_is_better',
      category: 'efficiency',
      notes: 'Planned production hours excluding scheduled maintenance.',
      updatedAt: now
    }
  ];

  write(db);
  console.log('Seed complete.');
  console.log('  admin / admin123');
  console.log('  engineer / engineer123');
  console.log('  viewer / viewer123');
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
