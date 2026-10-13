from django.urls import path
from django.conf import settings
from django.conf.urls.static import static

# Grouped imports for cleaner code
from .views import (
    login, 
    logout, 
    register, 
    verify_email,
    resend_verification_code,
    refresh_token, 
    current_user, 
    get_user, 
    update_user, 
    change_password,
    password_reset_request,
    password_reset_verify,
    password_reset_confirm,
    accept_terms,
)

urlpatterns = [
    # =====================
    # AUTHENTICATION
    # =====================
    path('login/', login, name='login'),
    path('logout/', logout, name='logout'),
    path('refresh/', refresh_token, name='refresh_token'),
    path('change-password/', change_password, name='change_password'),

    # =====================
    # FORGOT PASSWORD (public)
    # =====================
    path('password-reset/request/', password_reset_request, name='password_reset_request'),
    path('password-reset/verify/', password_reset_verify, name='password_reset_verify'),
    path('password-reset/confirm/', password_reset_confirm, name='password_reset_confirm'),

    # =====================
    # ACTIVE SESSION
    # =====================
    path('current/', current_user, name='current_user'),

    # =====================
    # TERMS AND DATA PRIVACY CONSENT
    # =====================
    # Records that the logged-in user agreed to the current terms.
    # See accept_terms() and TERMS_VERSION in views.py.
    path('terms/accept/', accept_terms, name='accept_terms'),
    
    # =====================
    # USER MANAGEMENT
    # =====================
    path('register/', register, name='register'),
    # STEP 2 of self-registration — activates the account (is_verified=True)
    # and emails the real temporary password. See register()/verify_email()
    # in views.py.
    path('verify-email/', verify_email, name='verify_email'),
    path('verify-email/resend/', resend_verification_code, name='resend_verification_code'),
    path('users/', get_user, name='get_user'),                 # Expected to handle GET (list all) and POST (create)
    path('users/<int:pk>/', update_user, name='update_user'),  # Expected to handle GET (single), PUT/PATCH (update)
]

# Only serve media files through Django during development
# In production, your web server (like Nginx or Apache) should handle this.
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)