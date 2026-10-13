from django.contrib import admin

from .models import QuestionBankEntry


@admin.register(QuestionBankEntry)
class QuestionBankEntryAdmin(admin.ModelAdmin):
    """Question Bank (table `question_bank`), managed in the app at
    Utilities -> Question Bank (QuestionBank.jsx)."""

    list_display = ("text", "categories", "choice_count", "created_at")
    list_filter = ("category",)
    search_fields = ("text", "category")
    ordering = ("category", "text")
    readonly_fields = ("created_at",)

    @admin.display(description="Choices")
    def choice_count(self, obj):
        return len(obj.options or [])
