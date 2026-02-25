from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "sqlite:///./turf.db"
    admin_password: str = "cricket123"
    cashfree_app_id: str = ""
    cashfree_secret: str = ""
    cashfree_env: str = "production"
    cors_origins: str = "*"

    @property
    def cors_origins_list(self):
        if self.cors_origins == "*":
            return ["*"]
        return [o.strip() for o in self.cors_origins.split(",")]

    @property
    def db_url(self):
        url = self.database_url
        # Railway gives postgres://, SQLAlchemy needs postgresql://
        if url.startswith("postgres://"):
            url = url.replace("postgres://", "postgresql://", 1)
        return url

    class Config:
        env_file = ".env"


settings = Settings()
