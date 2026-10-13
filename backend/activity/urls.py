from django.urls import path

from .views import activity_logs, import_activity_logs

urlpatterns = [
    path("", activity_logs, name="activity_logs"),
    path("import/", import_activity_logs, name="activity_logs_import"),
]
