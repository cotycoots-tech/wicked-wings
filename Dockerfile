FROM python:3.12-slim

WORKDIR /app

# No pip deps — stdlib only. Copy app tree.
COPY public ./public
COPY server ./server
COPY data ./data
COPY requirements.txt ./

ENV HOST=0.0.0.0
ENV PYTHONUNBUFFERED=1

# Railway injects PORT at runtime
EXPOSE 8080
CMD ["python", "server/app.py"]
