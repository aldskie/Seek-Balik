from django.urls import path

from .views import (
    list_notifications,
    mark_all_read,
    mark_read,
    preferences,
    register_push_token,
    remove_push_token,
    unread_count,
)

urlpatterns = [
    path("", list_notifications, name="list_notifications"),
    path("unread-count/", unread_count, name="notifications_unread_count"),
    path("read-all/", mark_all_read, name="notifications_mark_all_read"),
    path("<int:pk>/read/", mark_read, name="notification_mark_read"),
    path("preferences/", preferences, name="notification_preferences"),
    path("push-token/", register_push_token, name="register_push_token"),
    path("push-token/remove/", remove_push_token, name="remove_push_token"),
]
