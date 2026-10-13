from rest_framework import serializers

from .models import IssueReport


class IssueReportSerializer(serializers.ModelSerializer):
    """What the reporter submits and sees in their own history.
    The reporter can't set the status — it always starts as "open"."""

    status_label = serializers.CharField(source="get_status_display", read_only=True)
    category_label = serializers.CharField(source="get_category_display", read_only=True)

    class Meta:
        model = IssueReport
        fields = [
            "id",
            "subject",
            "category",
            "category_label",
            "description",
            "status",
            "status_label",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "status", "created_at", "updated_at"]

    def validate_subject(self, value):
        value = (value or "").strip()
        if not value:
            raise serializers.ValidationError("Please enter a subject.")
        return value

    def validate_description(self, value):
        value = (value or "").strip()
        if not value:
            raise serializers.ValidationError("Please describe the issue.")
        return value


class IssueReportAdminSerializer(serializers.ModelSerializer):
    """Staff view: includes who reported it. Only `status` can be changed."""

    status_label = serializers.CharField(source="get_status_display", read_only=True)
    category_label = serializers.CharField(source="get_category_display", read_only=True)
    reporter_name = serializers.SerializerMethodField()
    reporter_email = serializers.SerializerMethodField()

    class Meta:
        model = IssueReport
        fields = [
            "id",
            "account",
            "reporter_name",
            "reporter_email",
            "subject",
            "category",
            "category_label",
            "description",
            "status",
            "status_label",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "account",
            "subject",
            "category",
            "description",
            "created_at",
            "updated_at",
        ]

    def get_reporter_name(self, obj):
        account = obj.account
        if not account:
            return ""
        full = f"{account.first_name or ''} {account.last_name or ''}".strip()
        return full or account.email

    def get_reporter_email(self, obj):
        return obj.account.email if obj.account else ""
