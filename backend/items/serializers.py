import copy

from rest_framework import serializers
from .models import ItemDetails

# Older frontend code may still send the finder under these keys; all are
# mapped onto `student_id`. Keeping 'id_number' here means anything not yet
# updated to the new name keeps working.
LEGACY_ID_KEYS = ('id_number', 'student', 'finder')

# Old field names the frontend may still send -> new database fields.
LEGACY_DATE_KEYS = {
    'created_date': 'start_date',
    'created_time': 'start_time',
}

# The Lost/Found forms send the END of the date/time range as
# created_date_to / created_time_to -> stored in end_date / end_time.
# Unlike the start keys, a blank value here is kept (it clears the end).
LEGACY_RANGE_END_KEYS = {
    'created_date_to': 'end_date',
    'created_time_to': 'end_time',
}

# Optional range-end fields: a blank value means "no end".
OPTIONAL_RANGE_KEYS = ('end_date', 'end_time')

# FormData turns a JS null/undefined into these strings.
EMPTY_VALUES = ('', 'none', 'null', 'undefined')

# Roles allowed to see the correct verification answers. Adjust to match
# the role values your Account model actually uses.
STAFF_ROLES = ('admin', 'moderator', 'staff')


def _is_staff_request(request):
    user = getattr(request, 'user', None)
    if not user or not user.is_authenticated:
        return False
    if getattr(user, 'is_staff', False) or getattr(user, 'is_superuser', False):
        return True
    return str(getattr(user, 'role', '') or '').lower() in STAFF_ROLES


def _request_user_student_id(request):
    """Digits from the logged-in user's email/username local part, or ''."""
    user = getattr(request, 'user', None)
    if not user or not user.is_authenticated:
        return ''
    for value in (getattr(user, 'email', ''), getattr(user, 'username', '')):
        local = (value or '').split('@')[0]
        digits = ''.join(ch for ch in local if ch.isdigit())
        if digits:
            return digits
    return ''


# Hidden from anyone who isn't staff or the item's own reporter/finder:
# the finder's / reporter's details, and the name, contact number and email
# of whoever received the item.
PRIVATE_ITEM_FIELDS = (
    'email',
    'student_id',
    'poster_name',
    'claimed_by_name',
    'claimed_by_email',
    'claimed_by_contact',
    'released_by',
    'declined_remarks',
)


class ItemSerializers(serializers.ModelSerializer):
    """
    `student_id` is a plain 8-digit CharField on ItemDetails (validated by
    the model's student_id_validator), not a link to an Account.

    `is_mine` is True when the logged-in user is the finder who turned this
    surrendered item in (matched by Student ID or by the item's email).
    """

    is_mine = serializers.SerializerMethodField()

    class Meta:
        model = ItemDetails
        fields = '__all__'

    def get_is_mine(self, obj):
        if obj.type != 'Surrendered':
            return False

        request = self.context.get('request')
        user = getattr(request, 'user', None)
        if not user or not user.is_authenticated:
            return False

        my_id = _request_user_student_id(request)
        item_digits = ''.join(ch for ch in (obj.student_id or '') if ch.isdigit())
        if my_id and item_digits and my_id == item_digits:
            return True

        my_email = (getattr(user, 'email', '') or '').strip().lower()
        item_email = (obj.email or '').strip().lower()
        return bool(my_email) and my_email == item_email

    def to_internal_value(self, data):
        # Shallow copy so the keys below can be edited. NOT data.copy():
        # for a multipart request that's a QueryDict, whose .copy() is a
        # DEEP copy - and deep-copying a large uploaded photo (stored as a
        # temp file) raises "cannot pickle '_io.BufferedRandom' object".
        # copy.copy() gives a mutable copy that shares the file objects.
        data = copy.copy(data)

        # Legacy keys -> student_id (only if student_id wasn't sent itself).
        for key in LEGACY_ID_KEYS:
            if key in data:
                legacy = data.get(key)
                del data[key]
                if 'student_id' not in data:
                    data['student_id'] = legacy

        # created_date / created_time -> start_date / start_time.
        # Edit forms built from an API response send BOTH names, but only
        # the old name is bound to the form input, so when both are sent
        # the old-name value wins (it is the one the user may have edited).
        for old_key, new_key in LEGACY_DATE_KEYS.items():
            if old_key in data:
                legacy = data.get(old_key)
                del data[old_key]
                if str(legacy or '').strip().lower() not in EMPTY_VALUES:
                    data[new_key] = legacy

        # created_date_to / created_time_to -> end_date / end_time. When an
        # edit form sends both names, the _to value wins (it is the one
        # bound to the End Date / End Time inputs).
        for old_key, new_key in LEGACY_RANGE_END_KEYS.items():
            if old_key in data:
                legacy = data.get(old_key)
                del data[old_key]
                data[new_key] = legacy

        # "Returned" was removed (it meant the same as "Claimed"). Old
        # backups being restored may still send it.
        for key in ('status', 'status_before_archive'):
            if str(data.get(key) or '').strip().lower() == 'returned':
                data[key] = 'Claimed'

        # Photos are saved as ItemImage rows by the views (up to 3), and the
        # `image` cover field is synced from them, so uploaded files are
        # never written to `image` directly here.
        if 'image' in data:
            del data['image']

        # Blank end date/time from a form clears the value instead of
        # failing date/time parsing.
        for key in OPTIONAL_RANGE_KEYS:
            if key in data and str(data.get(key) or '').strip().lower() in EMPTY_VALUES:
                data[key] = None

        if 'student_id' in data:
            raw = str(data.get('student_id') or '').strip()
            if '@' in raw:
                # Accept 12345678@slc-sflu.edu.ph and keep just the digits.
                raw = raw.split('@', 1)[0].strip()

            if raw.lower() in EMPTY_VALUES:
                # Blank means "not provided": leaves the default on create
                # and the existing value untouched on update.
                del data['student_id']
            else:
                data['student_id'] = raw

        return super().to_internal_value(data)

    def validate(self, attrs):
        # A surrendered item needs the finder's Student ID when it is
        # created, otherwise no points can be awarded. Delete this block if
        # staff may log surrendered items without one.
        if self.instance is None:
            item_type = attrs.get('type', 'Lost')
            if item_type == 'Surrendered' and not attrs.get('student_id'):
                raise serializers.ValidationError(
                    {'student_id': 'Student ID is required for surrendered items.'}
                )

        # The end of the lost/found range can't be before its start.
        def current(field):
            if field in attrs:
                return attrs[field]
            return getattr(self.instance, field, None) if self.instance else None

        start_date, start_time = current('start_date'), current('start_time')
        end_date, end_time = current('end_date'), current('end_time')

        if end_time and not end_date:
            raise serializers.ValidationError(
                {'end_date': 'Enter an end date when an end time is given.'}
            )
        if start_date and end_date:
            if end_date < start_date:
                raise serializers.ValidationError(
                    {'end_date': 'End date cannot be before the start date.'}
                )
            if end_date == start_date and start_time and end_time and end_time < start_time:
                raise serializers.ValidationError(
                    {'end_time': 'End time cannot be before the start time on the same day.'}
                )
        return attrs

    def to_representation(self, instance):
        data = super().to_representation(instance)

        # Old names kept in responses so frontend pages that still read
        # created_date / created_time keep working.
        data['created_date'] = data.get('start_date')
        data['created_time'] = data.get('start_time')
        # End of the date/time range, under the names the forms use.
        data['created_date_to'] = data.get('end_date')
        data['created_time_to'] = data.get('end_time')

        # All 1-3 photos, oldest first: [{"id": 5, "image": "<url>"}, ...]
        # `image` stays the first photo for pages that show a single one.
        request = self.context.get('request')
        photos = []
        for photo in instance.images.all().order_by('id'):
            if not photo.image:
                continue
            url = photo.image.url
            if request is not None:
                url = request.build_absolute_uri(url)
            photos.append({'id': photo.id, 'image': url})
        data['images'] = photos
        if photos:
            data['image'] = photos[0]['image']

        # The correct answers must never reach non-staff API responses.
        # verify_answers() grades against the model directly, so the
        # Claim Modal still works without seeing them.
        if not _is_staff_request(self.context.get('request')):
            for n in range(1, 5):
                data.pop(f'verification_answer_{n}', None)

            # Personal details are for staff and the item's own reporter /
            # finder only, not for everyone browsing the public board.
            if not self._is_own_item(instance):
                for key in PRIVATE_ITEM_FIELDS:
                    data.pop(key, None)
                # A surrendered item's description is the staff-only note
                # used to check ownership answers; claimants must not see it.
                if instance.type == 'Surrendered':
                    data['description'] = ''

        return data

    def _is_own_item(self, obj):
        """True when the logged-in user reported (Lost) or turned in
        (Surrendered) this item, matched by Student ID or email."""
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        if not user or not user.is_authenticated:
            return False
        my_id = _request_user_student_id(request)
        item_digits = ''.join(ch for ch in (obj.student_id or '') if ch.isdigit())
        if my_id and item_digits and my_id == item_digits:
            return True
        my_email = (getattr(user, 'email', '') or '').strip().lower()
        item_email = (obj.email or '').strip().lower()
        return bool(my_email) and my_email == item_email