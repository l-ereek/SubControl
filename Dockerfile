FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY subcontrol_mvp_backend.py .
EXPOSE 8000
CMD ["uvicorn", "subcontrol_mvp_backend:app", "--host", "0.0.0.0", "--port", "8000"]
