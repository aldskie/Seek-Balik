from django.urls import path

from .views import (
    issue_report_detail,
    list_issue_reports,
    my_issue_reports,
    submit_issue_report,
)

# Mounted at "support/" in backend/urls.py:
#   POST support/issues/submit/   -> submit_issue_report   (any logged-in user)
#   GET  support/issues/mine/     -> my_issue_reports      (the user's own)
#   GET  support/issues/          -> list_issue_reports    (admin only)
#   GET/PUT/PATCH support/issues/<id>/ -> issue_report_detail (admin only)
urlpatterns = [
    path("issues/", list_issue_reports, name="support_issue_list"),
    path("issues/submit/", submit_issue_report, name="support_issue_submit"),
    path("issues/mine/", my_issue_reports, name="support_issue_mine"),
    path("issues/<int:pk>/", issue_report_detail, name="support_issue_detail"),
]
