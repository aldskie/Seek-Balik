"""Adds BlockedSlot: dates / time slots staff disabled for claim meetings."""
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("claim", "0016_claim_released_status"),
    ]

    operations = [
        migrations.CreateModel(
            name="BlockedSlot",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("date", models.DateField()),
                ("time_slot", models.CharField(blank=True, default="", max_length=50)),
                ("reason", models.CharField(blank=True, default="", max_length=200)),
                ("created_by", models.CharField(blank=True, default="", max_length=150)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
            ],
            options={
                "ordering": ["date", "time_slot"],
                "unique_together": {("date", "time_slot")},
            },
        ),
    ]
