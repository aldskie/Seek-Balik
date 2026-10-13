from django.urls import path
from .views import (
    get_claim,
    create_claim,
    schedule_meeting,
    available_schedules,
    delete_schedule,
    check_claim_status,
    check_item_claim,
    verify_answers,
    decline_claim,
    my_claims,
    reclaim_claim,
    blocked_slots,
    delete_blocked_slot,
)

urlpatterns = [
    path('', get_claim, name='get_claims'),
    path('create/', create_claim, name='create_claim'),
    path('schedule/<int:pk>/', schedule_meeting, name='schedule_meeting'),
    path('decline/<int:pk>/', decline_claim, name='decline_claim'),
    path('schedules/', available_schedules, name='available_schedules'),
    path('schedules/<int:pk>/', delete_schedule, name='delete_schedule'),
    path('blocked-slots/', blocked_slots, name='blocked_slots'),
    path('blocked-slots/<int:pk>/', delete_blocked_slot, name='delete_blocked_slot'),
    path('check/<int:item_id>/', check_claim_status, name='check_claim_status'),
    path('check-item/<int:item_id>/', check_item_claim, name='check_item_claim'),
    path('verify-answers/<int:item_id>/', verify_answers, name='verify_answers'),
    path('my-claims/', my_claims, name='my_claims'),
    path('reclaim/<int:pk>/', reclaim_claim, name='reclaim_claim'),
]