from rest_framework import status
from rest_framework.decorators import api_view, parser_classes, permission_classes
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import ReportIssue
from .serializers import ReportIssueSerializer, ReportIssueStaffUpdateSerializer
from alerts.services import notify_issue_status, notify_staff_new_issue


def is_staff_user(user):
    """Only admins can see and manage every issue report (moderators
    can't — the Report Issues page is admin-only)."""
    role = (getattr(user, "role", "") or "").lower()
    return user.is_superuser or role == "admin"


# GET report-issue/
# Admins see every report; everyone else only sees their own.
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def report_issue_list(request):
    qs = ReportIssue.objects.select_related("user")

    if not is_staff_user(request.user):
        qs = qs.filter(user=request.user)

    status_param = request.query_params.get("status")
    if status_param:
        qs = qs.filter(status=status_param)

    serializer = ReportIssueSerializer(qs, many=True, context={"request": request})
    return Response(serializer.data)


# POST report-issue/create/
# Called by the mobile app. Accepts multipart (with screenshot) or JSON.
@api_view(["POST"])
@permission_classes([IsAuthenticated])
@parser_classes([MultiPartParser, FormParser, JSONParser])
def report_issue_create(request):
    serializer = ReportIssueSerializer(data=request.data, context={"request": request})
    if serializer.is_valid():
        # Backup & Restore (admins only): put a deleted report back as it
        # was - original reporter, status, admin notes and date - instead of
        # a new Pending report filed by the admin.
        restoring = is_staff_user(request.user) and str(
            request.data.get("restore", "")
        ).lower() in ("1", "true", "yes")

        reporter = request.user
        if restoring:
            from account.models import Account
            email = (request.data.get("reporter_email") or "").strip()
            if email:
                reporter = Account.objects.filter(email__iexact=email).first() or request.user

        report = serializer.save(user=reporter)

        if restoring:
            restored = {}
            valid_statuses = {key for key, _ in ReportIssue.STATUS_CHOICES}
            if request.data.get("status") in valid_statuses:
                restored["status"] = request.data.get("status")
            if "admin_notes" in request.data:
                restored["admin_notes"] = request.data.get("admin_notes") or ""
            created_at = request.data.get("created_at")
            if created_at:
                from django.utils.dateparse import parse_datetime
                parsed = parse_datetime(str(created_at))
                if parsed:
                    restored["created_at"] = parsed
            if restored:
                ReportIssue.objects.filter(pk=report.pk).update(**restored)
                report.refresh_from_db()
            return Response(
                ReportIssueSerializer(report, context={"request": request}).data,
                status=status.HTTP_201_CREATED,
            )

        # Bell notification for admins.
        notify_staff_new_issue(report, actor=request.user)

        return Response(serializer.data, status=status.HTTP_201_CREATED)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


# GET / PATCH / DELETE report-issue/<id>/
@api_view(["GET", "PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
def report_issue_detail(request, pk):
    try:
        report = ReportIssue.objects.select_related("user").get(pk=pk)
    except ReportIssue.DoesNotExist:
        return Response({"detail": "Report not found."}, status=status.HTTP_404_NOT_FOUND)

    staff = is_staff_user(request.user)

    if request.method == "GET":
        if not staff and report.user_id != request.user.id:
            return Response({"detail": "Not allowed."}, status=status.HTTP_403_FORBIDDEN)
        return Response(ReportIssueSerializer(report, context={"request": request}).data)

    if not staff:
        return Response(
            {"detail": "Only admins can do this."},
            status=status.HTTP_403_FORBIDDEN,
        )

    if request.method == "PATCH":
        old_status = report.status
        serializer = ReportIssueStaffUpdateSerializer(report, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            # Tells the reporter their issue moved to a new status.
            notify_issue_status(report, old_status)
            return Response(ReportIssueSerializer(report, context={"request": request}).data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    # DELETE
    if report.screenshot:
        report.screenshot.delete(save=False)
    report.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)
