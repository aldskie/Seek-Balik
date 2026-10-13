from django.urls import path

from .views import report_issue_create, report_issue_detail, report_issue_list

urlpatterns = [
    path("", report_issue_list, name="report-issue-list"),
    path("create/", report_issue_create, name="report-issue-create"),
    path("<int:pk>/", report_issue_detail, name="report-issue-detail"),
]
