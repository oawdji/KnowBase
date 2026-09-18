import logging
import threading
from minio import Minio
from app.core.config import settings

logger = logging.getLogger(__name__)

# 进程内共享一个客户端，避免每次调用都新建连接池
_client = None
_lock = threading.Lock()


def get_minio_client() -> Minio:
    """
    Get a MinIO client instance.
    首次创建，之后复用；MinIO SDK 底层 urllib3 连接池是线程安全的，可跨线程共享。
    """
    global _client
    if _client is not None:
        return _client

    with _lock:
        if _client is None:
            logger.info("Creating MinIO client instance.")
            _client = Minio(
                settings.MINIO_ENDPOINT,
                access_key=settings.MINIO_ACCESS_KEY,
                secret_key=settings.MINIO_SECRET_KEY,
                secure=False  # Set to True if using HTTPS
            )
    return _client

def init_minio():
    """
    Initialize MinIO by creating the bucket if it doesn't exist.
    """
    client = get_minio_client()
    logger.info(f"Checking if bucket {settings.MINIO_BUCKET_NAME} exists.")
    if not client.bucket_exists(settings.MINIO_BUCKET_NAME):
        logger.info(f"Bucket {settings.MINIO_BUCKET_NAME} does not exist. Creating bucket.")
        client.make_bucket(settings.MINIO_BUCKET_NAME)
    else:
        logger.info(f"Bucket {settings.MINIO_BUCKET_NAME} already exists.")
