FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

COPY backend/requirements.txt /app/requirements.txt
# `emergentintegrations` belonged to the original hosted environment and is not
# published on PyPI. It is imported lazily only by the optional AI support route.
RUN sed -i '/^emergentintegrations==/d' /app/requirements.txt \
    && pip install --no-cache-dir -r /app/requirements.txt

COPY backend/ /app/

EXPOSE 8001

CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8001"]
