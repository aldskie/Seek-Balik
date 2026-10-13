from django.urls import path
# pyrefly: ignore [missing-import]
from .views import (
    get_item_details,
    create_item_details,
    item_details,
    track_item,
    verify_answers,
    get_my_items,
)

urlpatterns = [
    path("details/", get_item_details),
    path("create/", create_item_details),
    path("details/<int:pk>/", item_details),
    path("track/<str:ticket_code>/", track_item),
    path("verify-answers/<int:pk>/", verify_answers),
    path("mine/", get_my_items),
]