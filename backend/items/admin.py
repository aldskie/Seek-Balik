from django.contrib import admin
from .models import ItemDetails, ItemImage


class ItemImageInline(admin.TabularInline):
    model = ItemImage
    extra = 0


class ItemAdmin(admin.ModelAdmin):
    list_display = (
        'id', 'student_id', 'title', 'type', 'location',
        'category', 'status', 'start_date', 'start_time',
        'end_date', 'end_time',
        'claimed_date', 'claimed_by_name',
        'time_stamp', 'image',
    )
    list_filter = ('type', 'status', 'category', 'start_date')
    date_hierarchy = 'start_date'
    search_fields = (
        'student_id', 'title', 'poster_name', 'ticket_code',
        'claimed_by_name', 'claimed_by_email',
    )
    inlines = [ItemImageInline]


admin.site.register(ItemDetails, ItemAdmin)


@admin.register(ItemImage)
class ItemImageAdmin(admin.ModelAdmin):
    list_display = ("id", "item", "image", "uploaded_at")
    search_fields = ("item__title", "item__ticket_code")
    date_hierarchy = "uploaded_at"
