from django.db import models

# Item categories a question can be tagged with (same list as the item
# categories in the frontend). A question can belong to several, e.g. one
# "What color of the item?" for every category.
ITEM_CATEGORIES = [
    "Accessories",
    "ID",
    "Academic Materials",
    "Bags & Wallets",
    "Clothing",
    "Electronic",
    "Keys",
]


class QuestionBankEntry(models.Model):
    """One preset verification question. Mirrors the shape the React
    QuestionBank.jsx component used to keep in localStorage: text,
    category, and an optional list of predefined answer choices."""

    text = models.CharField(max_length=150)
    # First of `categories`; kept so older code and backups still work.
    category = models.CharField(max_length=50, blank=True, default="")
    # Every item category this question applies to (checkboxes in
    # QuestionBank.jsx).
    categories = models.JSONField(default=list, blank=True)
    # Default group: shared questions (color, size, design/features) that
    # always apply to every category.
    is_default = models.BooleanField(default=False)
    # Empty list = free-text question (same convention as the old
    # localStorage version). Stored as native Postgres JSON.
    options = models.JSONField(default=list, blank=True)
    # Links answer choices to item types, e.g.
    #   {"cellphone": ["Tecno Pova"], "__all__": ["Generic"]}
    # so a choice an admin adds only appears for the matching kind of
    # item (see frontend/src/utils/itemOptionGroups.js). "__all__"
    # means every item type in the category.
    option_groups = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'question_bank'
        ordering = ['-is_default', '-created_at']

    def __str__(self):
        return f"[{', '.join(self.categories or [self.category])}] {self.text}"