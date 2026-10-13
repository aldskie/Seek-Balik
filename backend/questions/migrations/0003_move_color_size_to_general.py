# Moves the Color and Size questions to the General category.
#
# If an earlier version of 0002 already added a Color and a Size question to
# every item category, those copies are removed (only when their answer
# choices are still exactly the seeded lists, so questions you edited are
# kept) and one General Color + one General Size question are ensured.

from django.db import migrations

from importlib import import_module

seed = import_module('questions.migrations.0002_seed_default_questions')


def move_to_general(apps, schema_editor):
    QuestionBankEntry = apps.get_model('questions', 'QuestionBankEntry')

    for category in seed.CATEGORIES:
        for text, options in (
            (seed.COLOR_QUESTION, seed.COLORS),
            (seed.SIZE_QUESTION, seed.CATEGORY_SIZES[category]),
        ):
            for q in QuestionBankEntry.objects.filter(category=category, text__iexact=text):
                if list(q.options or []) == list(options):
                    q.delete()

    for text, options in (
        (seed.COLOR_QUESTION, seed.COLORS),
        (seed.SIZE_QUESTION, seed.GENERAL_SIZES),
    ):
        if not QuestionBankEntry.objects.filter(category='General', text__iexact=text).exists():
            QuestionBankEntry.objects.create(category='General', text=text, options=list(options))


class Migration(migrations.Migration):

    dependencies = [
        ('questions', '0002_seed_default_questions'),
    ]

    operations = [
        migrations.RunPython(move_to_general, migrations.RunPython.noop),
    ]
