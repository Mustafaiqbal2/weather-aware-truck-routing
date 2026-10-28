"""Unit conversions. Providers are queried in metric; every conversion happens here."""

METERS_PER_MILE = 1609.344
KG_PER_LB = 0.45359237
MM_PER_INCH = 25.4
CM_PER_INCH = 2.54
KMH_PER_MPH = 1.609344

# Routing needs gross vehicle weight for road restrictions, but the risk rules use the
# load the driver enters. A typical empty US tractor + 53 ft trailer weighs about 35,000 lb.
TYPICAL_TARE_LB = 35_000
LEGAL_GROSS_LIMIT_LB = 80_000  # US federal limit on Interstates without a permit


def meters_to_miles(m: float) -> float:
    return m / METERS_PER_MILE


def miles_to_meters(mi: float) -> float:
    return mi * METERS_PER_MILE


def lb_to_kg(lb: float) -> float:
    return lb * KG_PER_LB


def mm_to_in(mm: float) -> float:
    return mm / MM_PER_INCH


def cm_to_in(cm: float) -> float:
    return cm / CM_PER_INCH


def kmh_to_mph(kmh: float) -> float:
    return kmh / KMH_PER_MPH


def gross_weight_lb(load_lb: float) -> float:
    return load_lb + TYPICAL_TARE_LB
