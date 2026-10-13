from rest_framework.routers import DefaultRouter

from .views import QuestionBankViewSet

router = DefaultRouter()
# Empty prefix here since the root urls.py already mounts this app at
# "questions/" (path("questions/", include("questions.urls"))) — using
# r'questions' here too would make the final URL /questions/questions/.
router.register(r'', QuestionBankViewSet, basename='question-bank')

urlpatterns = router.urls