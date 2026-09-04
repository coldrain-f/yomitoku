import asyncio
import json
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from app.core.config import get_settings
from app.schemas import ReadingLanguage


class TranslationError(RuntimeError):
    """The configured translation provider could not translate the passage."""


def deepl_translate_url(api_key: str) -> str:
    base_url = (
        "https://api-free.deepl.com"
        if api_key.endswith(":fx")
        else "https://api.deepl.com"
    )
    return f"{base_url}/v2/translate"


def _translate_with_deepl(
    *, api_key: str, source_text: str, source_language: ReadingLanguage
) -> str:
    target_language = "KO" if source_language == "ja" else "JA"
    payload = json.dumps(
        {
            "text": [source_text],
            "source_lang": source_language.upper(),
            "target_lang": target_language,
            "preserve_formatting": True,
        }
    ).encode("utf-8")
    request = Request(
        deepl_translate_url(api_key),
        data=payload,
        headers={
            "Authorization": f"DeepL-Auth-Key {api_key}",
            "Content-Type": "application/json",
            "User-Agent": "Yomitoku/1.0",
        },
        method="POST",
    )
    try:
        with urlopen(request, timeout=20) as response:  # noqa: S310
            body = json.loads(response.read().decode("utf-8"))
    except HTTPError as error:
        if error.code == 456:
            raise TranslationError(
                "DeepL 번역 한도에 도달했습니다. 잠시 후 다시 시도해 주세요."
            ) from error
        if error.code == 429:
            raise TranslationError(
                "번역 요청이 많습니다. 잠시 후 다시 시도해 주세요."
            ) from error
        raise TranslationError("DeepL 번역 요청을 처리하지 못했습니다.") from error
    except URLError as error:
        raise TranslationError("번역 서비스에 연결하지 못했습니다.") from error

    translations = body.get("translations", [])
    translated_text = translations[0].get("text") if translations else None
    if not isinstance(translated_text, str) or not translated_text.strip():
        raise TranslationError("번역 결과를 받지 못했습니다.")
    return translated_text


_translation_cache: dict[tuple[ReadingLanguage, str], str] = {}


async def translate_passage(
    source_text: str, source_language: ReadingLanguage
) -> str:
    cache_key = (source_language, source_text)
    if cached := _translation_cache.get(cache_key):
        return cached

    settings = get_settings()
    api_key = (
        settings.deepl_api_key.get_secret_value().strip()
        if settings.deepl_api_key is not None
        else ""
    )
    if not api_key:
        raise TranslationError(
            "번역 기능이 아직 설정되지 않았습니다. 관리자에게 DEEPL_API_KEY 설정을 요청해 주세요."
        )
    translated_text = await asyncio.to_thread(
        _translate_with_deepl,
        api_key=api_key,
        source_text=source_text,
        source_language=source_language,
    )
    if len(_translation_cache) >= 256:
        _translation_cache.pop(next(iter(_translation_cache)))
    _translation_cache[cache_key] = translated_text
    return translated_text
