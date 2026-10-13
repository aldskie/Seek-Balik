from rest_framework import serializers

from .models import ITEM_CATEGORIES, QuestionBankEntry


def clean_categories(values):
    """Valid item categories, in the standard order. "General" / "All"
    (no longer a category) mean every category."""
    if isinstance(values, str):
        values = [values]
    wanted = {str(v).strip().lower() for v in (values or []) if str(v).strip()}
    if wanted & {"general", "all"}:
        return list(ITEM_CATEGORIES)
    return [c for c in ITEM_CATEGORIES if c.lower() in wanted]


class QuestionBankEntrySerializer(serializers.ModelSerializer):
    class Meta:
        model = QuestionBankEntry
        fields = ['id', 'text', 'category', 'categories', 'is_default', 'options', 'option_groups', 'created_at']
        read_only_fields = ['id', 'created_at']
        extra_kwargs = {'category': {'required': False}}

    def validate(self, data):
        # `categories` (list) is the real field. Older callers (e.g. a
        # backup restore) may only send `category`.
        is_default = data.get('is_default', getattr(self.instance, 'is_default', False))
        if is_default:
            # Default questions always apply to every category.
            data['categories'] = list(ITEM_CATEGORIES)
            data['category'] = ITEM_CATEGORIES[0]
            return data
        if 'categories' in data or 'category' in data or not self.instance:
            raw = data.get('categories')
            if not raw:
                raw = data.get('category') or []
            categories = clean_categories(raw)
            if not categories:
                raise serializers.ValidationError({'categories': 'Pick at least one category.'})
            data['categories'] = categories
            data['category'] = categories[0]
        return data

    def validate_text(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Question text can't be empty.")
        return value

    def validate_options(self, value):
        if not isinstance(value, list):
            raise serializers.ValidationError("options must be a list of strings.")
        return [str(opt).strip() for opt in value if str(opt).strip()]

    def validate_option_groups(self, value):
        if value in (None, ""):
            return {}
        if not isinstance(value, dict):
            raise serializers.ValidationError(
                "option_groups must be an object of item type -> list of choices."
            )
        cleaned = {}
        for key, choices in value.items():
            if not isinstance(choices, list):
                raise serializers.ValidationError(
                    f"option_groups['{key}'] must be a list of choices."
                )
            items = [str(c).strip() for c in choices if str(c).strip()]
            if items:
                cleaned[str(key).strip()] = items
        return cleaned