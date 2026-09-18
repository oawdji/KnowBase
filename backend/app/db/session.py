from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.core.config import settings

# pool_pre_ping：每次取出连接前先探活。MySQL 默认 8 小时 wait_timeout 会断开空闲连接，
#   没有它时服务空闲一夜后第一个请求必定报 "MySQL server has gone away"。
# pool_recycle：主动回收超过 1 小时的连接，比 wait_timeout 更早换新，属于双保险。
engine = create_engine(
    settings.get_database_url,
    pool_pre_ping=True,
    pool_recycle=3600,
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close() 