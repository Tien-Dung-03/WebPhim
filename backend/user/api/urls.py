from django.urls import path, include
from .views import UserRetrieveUpdateDestroyAPIView, RegisterAPIView, GoogleLoginView, VerifyEmailView
from .views import UserRetrieveUpdateDestroyAPIView, RegisterAPIView, GoogleLoginView, VerifyEmailView,  UserDetailAPIView
from .views import CustomTokenObtainPairView, LogoutView

from rest_framework.routers import DefaultRouter

urlpatterns = [
    path('me', UserRetrieveUpdateDestroyAPIView.as_view(), name='user-detail'), # api người dùng xem, cập nhật, xóa tài khoản của mình
    path('login', CustomTokenObtainPairView.as_view(), name='token_obtain_pair'), # api đăng nhập
    path('register', RegisterAPIView.as_view(), name ='register' ), # api đăng ký 
    path('login/google', GoogleLoginView.as_view(), name='google-login'), # api đăng nhập bằng google
    path('logout/', LogoutView.as_view(), name='logout'), #Api logout
    path('verify-email/<uidb64>/<token>/', VerifyEmailView.as_view(), name='verify-email'), # api xác thực email
    path('user-info/<int:user_id>/', UserDetailAPIView.as_view(), name='user-info'), # api lấy thông tin người dùng khác
 ]

