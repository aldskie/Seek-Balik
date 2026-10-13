from rest_framework import viewsets, filters
from rest_framework.permissions import SAFE_METHODS, BasePermission

from claim.permissions import IsStaffMember


class ReadOnlyOrStaff(BasePermission):
    """
    Claim forms read the questions; only Admin / Moderator can add, edit or
    delete them. There was no check before, so anyone (even logged out)
    could change or wipe the Question Bank.
    """

    message = IsStaffMember.message

    def has_permission(self, request, view):
        return request.method in SAFE_METHODS or IsStaffMember().has_permission(request, view)

from .models import QuestionBankEntry
from .serializers import QuestionBankEntrySerializer


class QuestionBankViewSet(viewsets.ModelViewSet):
    """
    CRUD for preset verification questions.

    GET    /questions/                 -> list (supports ?category=Clothing and ?search=brand)
    POST   /questions/                 -> create
    GET    /questions/{id}/            -> retrieve
    PUT    /questions/{id}/            -> update
    PATCH  /questions/{id}/            -> partial update
    DELETE /questions/{id}/            -> delete
    """
    queryset = QuestionBankEntry.objects.all()
    serializer_class = QuestionBankEntrySerializer
    permission_classes = [ReadOnlyOrStaff]
    filter_backends = [filters.SearchFilter]
    search_fields = ['text']

    def get_queryset(self):
        qs = super().get_queryset()
        category = self.request.query_params.get('category')
        if category and category != 'All':
            # JSON "contains" isn't available on SQLite, so filter in Python.
            ids = [q.id for q in qs if category in (q.categories or [q.category])]
            qs = qs.filter(id__in=ids)
        return qs