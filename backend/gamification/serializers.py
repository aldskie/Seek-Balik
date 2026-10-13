from rest_framework import serializers
from .models import LeaderboardPlayer, PointTransaction


def _account_names(serializer):
    """{id_number: account name}, computed once per response."""
    names = serializer.context.get("account_names")
    if names is None:
        from .services import registered_accounts_by_id
        names = registered_accounts_by_id()
        serializer.context["account_names"] = names
    return names


class LeaderboardPlayerSerializer(serializers.ModelSerializer):
    """
    Players are identified by ID number (`student_id` / `id_number`).
    If that ID number belongs to a registered account, the account's name
    is shown and `is_registered` is True -- including points earned before
    the student registered.
    """

    full_name = serializers.SerializerMethodField()
    id_number = serializers.CharField(source="student_id", read_only=True)
    is_registered = serializers.SerializerMethodField()

    class Meta:
        model = LeaderboardPlayer
        fields = ["id", "student_id", "id_number", "full_name", "points", "is_registered"]

    def get_full_name(self, obj):
        return _account_names(self).get(obj.student_id) or obj.full_name

    def get_is_registered(self, obj):
        return obj.student_id in _account_names(self)


class PointTransactionSerializer(serializers.ModelSerializer):
    player_name = serializers.SerializerMethodField()
    student_id = serializers.CharField(source="player.student_id", read_only=True)

    class Meta:
        model = PointTransaction
        fields = [
            "id",
            "player_name",
            "student_id",
            "points",
            "reason",
            "item_id",
            "created_at",
        ]

    def get_player_name(self, obj):
        return _account_names(self).get(obj.player.student_id) or obj.player.full_name