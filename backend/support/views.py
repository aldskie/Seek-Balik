from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated

from alerts.services import notify_issue_status

from .models import IssueReport
from .serializers import IssueReportSerializer, IssueReportAdminSerializer


# Roles that may see and update everyone's issue reports (Utilities >
# Report Issues). Add "moderator" here if moderators should see them too.
STAFF_ROLES = {"admin"}


# Only admins can see and update everyone's issue reports. Anyone logged in
# can submit and see their own.
#
# The account can mark an admin in several ways, so all of them are checked
# (the same fields the apps check). Before, only is_superuser and an
# "is_admin" attribute counted, so an admin whose account stores the role in
# a field such as `role` got "You do not have permission" and the Report
# Issues page could not load anything.
def _is_staff(user):
    if not user or not getattr(user, "is_authenticated", False):
        return False

    if getattr(user, "is_superuser", False) or getattr(user, "is_admin", False):
        return True

    for field in ("role", "user_role", "account_type", "user_type"):
        value = getattr(user, field, None)
        if isinstance(value, str) and value.strip().lower() in STAFF_ROLES:
            return True

    try:
        if user.groups.filter(name__iexact="admin").exists():
            return True
    except Exception:
        pass

    return False


#SUBMIT
@api_view(["POST"])
@permission_classes([IsAuthenticated])
def submit_issue_report(request):

    serializer = IssueReportSerializer(data=request.data)

    if serializer.is_valid():
        serializer.save(account=request.user)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


#HISTORY
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def my_issue_reports(request):

    reports = IssueReport.objects.filter(account=request.user)
    serializer = IssueReportSerializer(reports, many=True)
    return Response(serializer.data, status=status.HTTP_200_OK)

#GET
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def list_issue_reports(request):

    if not _is_staff(request.user):
        return Response(
            {"error": "You do not have permission to view issue reports."},
            status=status.HTTP_403_FORBIDDEN,
        )

    reports = IssueReport.objects.select_related("account").all()

    status_filter = request.query_params.get("status")
    if status_filter:
        reports = reports.filter(status=status_filter)

    category_filter = request.query_params.get("category")
    if category_filter:
        reports = reports.filter(category=category_filter)

    serializer = IssueReportAdminSerializer(reports, many=True)
    return Response(serializer.data, status=status.HTTP_200_OK)


#SPECIFIC REPORT
# PATCH is accepted as well as PUT because the mobile app sends PATCH.
@api_view(["GET", "PUT", "PATCH"])
@permission_classes([IsAuthenticated])
def issue_report_detail(request, pk):

    if not _is_staff(request.user):
        return Response(
            {"error": "You do not have permission to view issue reports."},
            status=status.HTTP_403_FORBIDDEN,
        )

    try:
        report = IssueReport.objects.select_related("account").get(pk=pk)
    except IssueReport.DoesNotExist:
        return Response(
            {"error": "Report not found."},
            status=status.HTTP_404_NOT_FOUND,
        )

    if request.method == "GET":
        return Response(IssueReportAdminSerializer(report).data)

    # PUT / PATCH — status update only (see read_only_fields on the serializer)
    old_status = report.status

    serializer = IssueReportAdminSerializer(report, data=request.data, partial=True)

    if serializer.is_valid():
        updated_report = serializer.save()

        # In-app notification for the person who reported the issue.
        notify_issue_status(updated_report, old_status)

        return Response(serializer.data, status=status.HTTP_200_OK)

    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)