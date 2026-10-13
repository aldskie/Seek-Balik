from rest_framework import serializers

from .models import ReportIssue


class ReporterSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    first_name = serializers.CharField(allow_blank=True)
    last_name = serializers.CharField(allow_blank=True)
    email = serializers.EmailField(allow_blank=True)


class ReportIssueSerializer(serializers.ModelSerializer):
    user = ReporterSerializer(read_only=True)
    reporter_name = serializers.SerializerMethodField()
    reporter_email = serializers.SerializerMethodField()

    class Meta:
        model = ReportIssue
        fields = [
            "id",
            "user",
            "reporter_name",
            "reporter_email",
            "subject",
            "description",
            "category",
            "priority",
            "status",
            "screenshot",
            "device_info",
            "app_version",
            "admin_notes",
            "created_at",
            "updated_at",
        ]
        # Users from the mobile app can't set these; only staff can.
        read_only_fields = ["status", "admin_notes", "created_at", "updated_at"]

    def get_reporter_name(self, obj):
        if not obj.user:
            return ""
        full = f"{obj.user.first_name or ''} {obj.user.last_name or ''}".strip()
        return full or getattr(obj.user, "username", "")

    def get_reporter_email(self, obj):
        return obj.user.email if obj.user else ""


class ReportIssueStaffUpdateSerializer(serializers.ModelSerializer):
    """Used by admins/moderators to update status and notes."""

    class Meta:
        model = ReportIssue
        fields = ["status", "admin_notes", "priority"]
