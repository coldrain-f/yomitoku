import warnings
from pathlib import Path

from alembic.config import Config
from alembic.script import ScriptDirectory


def test_alembic_revisions_fit_the_default_version_column() -> None:
    backend_directory = Path(__file__).resolve().parents[1]
    with warnings.catch_warnings():
        warnings.filterwarnings("ignore", message="No path_separator found")
        script = ScriptDirectory.from_config(
            Config(str(backend_directory / "alembic.ini"))
        )

    assert all(
        len(revision.revision) <= 32
        for revision in script.walk_revisions()
        if revision.revision is not None
    )
