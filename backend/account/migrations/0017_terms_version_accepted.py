"""
Terms consent is now versioned (TERMS_VERSION in account/views.py).
Accounts that already agreed while registering (terms_accepted_at set by
0016) are recorded as having agreed to version "1".
"""
from django.db import migrations, models


# Adds the column only when the database doesn't have it yet.
#
# Two 0016 migrations were created for the same change (one by each
# teammate): 0016_terms_accepted_at (+ 0017) and
# 0016_account_terms_accepted_at_and_more. Depending on which one a
# database ran first, the other one would try to add the same columns again
# and stop with "duplicate column name". With this operation every one of
# them skips a column that is already there, so any database can run all of
# them. Django's record of the model is updated as usual either way.
class AddFieldIfMissing(migrations.AddField):
    def database_forwards(self, app_label, schema_editor, from_state, to_state):
        model = to_state.apps.get_model(app_label, self.model_name)
        connection = schema_editor.connection
        with connection.cursor() as cursor:
            columns = {
                column.name
                for column in connection.introspection.get_table_description(
                    cursor, model._meta.db_table
                )
            }
        if model._meta.get_field(self.name).column in columns:
            return
        super().database_forwards(app_label, schema_editor, from_state, to_state)


def mark_existing_consent(apps, schema_editor):
    Account = apps.get_model("account", "Account")
    Account.objects.filter(terms_accepted_at__isnull=False).update(terms_version_accepted="1")


class Migration(migrations.Migration):

    dependencies = [
        ("account", "0016_terms_accepted_at"),
    ]

    operations = [
        AddFieldIfMissing(
            model_name="account",
            name="terms_version_accepted",
            field=models.CharField(blank=True, default="", max_length=20),
        ),
        migrations.RunPython(mark_existing_consent, migrations.RunPython.noop),
    ]