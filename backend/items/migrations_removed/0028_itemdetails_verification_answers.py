from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('items', '0027_itemimage'),
    ]

    operations = [
        migrations.AddField(
            model_name='itemdetails',
            name='verification_answer_1',
            field=models.CharField(blank=True, default='', max_length=150),
        ),
        migrations.AddField(
            model_name='itemdetails',
            name='verification_answer_2',
            field=models.CharField(blank=True, default='', max_length=150),
        ),
        migrations.AddField(
            model_name='itemdetails',
            name='verification_answer_3',
            field=models.CharField(blank=True, default='', max_length=150),
        ),
        migrations.AddField(
            model_name='itemdetails',
            name='verification_answer_4',
            field=models.CharField(blank=True, default='', max_length=150),
        ),
    ]
