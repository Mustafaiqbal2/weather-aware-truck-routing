from django.urls import path
from drf_spectacular.views import SpectacularAPIView

from . import views

urlpatterns = [
    path("health", views.health, name="health"),
    path("rules", views.rules, name="rules"),
    path("geocode", views.geocode, name="geocode"),
    path("reverse", views.reverse_geocode, name="reverse"),
    path("routes", views.routes, name="routes"),
    path("assess", views.assess, name="assess"),
    path("heatmap", views.heatmap, name="heatmap"),
    path("schema", SpectacularAPIView.as_view(), name="schema"),
]
