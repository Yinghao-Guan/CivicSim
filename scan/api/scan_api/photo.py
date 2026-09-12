"""Photo decoding: EXIF GPS, orientation, and a model-sized JPEG.

Phones often strip GPS on upload (iOS Safari and Android's photo picker both
do by default), so a missing location is the normal case, not an error. The
caller falls back to a pin the user places.
"""

from dataclasses import dataclass
from io import BytesIO

from PIL import Image, ImageOps, UnidentifiedImageError
from pillow_heif import register_heif_opener

register_heif_opener()

GPS_IFD = 0x8825
GPS_LATITUDE_REF, GPS_LATITUDE = 1, 2
GPS_LONGITUDE_REF, GPS_LONGITUDE = 3, 4

#: Long edge of the image sent to the model. Street issues stay legible and
#: the request stays small.
MODEL_MAX_EDGE = 1600


class PhotoError(ValueError):
    """The upload is not an image we can read."""


@dataclass(frozen=True)
class DecodedPhoto:
    #: [longitude, latitude] from EXIF, or None when the photo carries none.
    gps: tuple[float, float] | None
    width: int
    height: int
    #: Upright, downscaled JPEG for the vision model.
    jpeg: bytes


def decode_photo(data: bytes) -> DecodedPhoto:
    try:
        image = Image.open(BytesIO(data))
        image.load()
    except (UnidentifiedImageError, OSError) as exc:
        raise PhotoError("The upload is not a readable image.") from exc

    gps = read_gps(image)
    upright = ImageOps.exif_transpose(image).convert("RGB")
    width, height = upright.size
    upright.thumbnail((MODEL_MAX_EDGE, MODEL_MAX_EDGE))

    buffer = BytesIO()
    upright.save(buffer, format="JPEG", quality=85)
    return DecodedPhoto(gps=gps, width=width, height=height, jpeg=buffer.getvalue())


def read_gps(image: Image.Image) -> tuple[float, float] | None:
    """[longitude, latitude] from the GPS IFD, or None if absent or unusable."""
    try:
        gps = image.getexif().get_ifd(GPS_IFD)
    except Exception:  # Malformed EXIF is common; treat it as no location.
        return None

    try:
        lat = _degrees(gps[GPS_LATITUDE], gps.get(GPS_LATITUDE_REF, "N"))
        lon = _degrees(gps[GPS_LONGITUDE], gps.get(GPS_LONGITUDE_REF, "E"))
    except (KeyError, TypeError, ValueError, ZeroDivisionError):
        return None

    # (0, 0) is what several apps write when they had no fix.
    if not (-90 <= lat <= 90 and -180 <= lon <= 180) or (lat == 0 and lon == 0):
        return None
    return (lon, lat)


def _degrees(dms, ref) -> float:
    d, m, s = (float(part) for part in dms)
    value = d + m / 60 + s / 3600
    if isinstance(ref, bytes):
        ref = ref.decode(errors="ignore")
    return -value if str(ref).strip().upper() in ("S", "W") else value
