from sqlalchemy import Column, Integer, String
from sqlalchemy.ext.declarative import declarative_base

Base = declarative_base()

class ResultModel(Base):
    __tablename__ = "results"

    id = Column(Integer, primary_key=True, index=True)
    pdf_id = Column(Integer)
    class_id = Column(Integer)
    class_name = Column(String)
    count = Column(Integer)