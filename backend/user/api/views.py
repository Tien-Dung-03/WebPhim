from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth import logout, get_user_model
from django.utils import timezone
from django.utils.dateparse import parse_date
from django.db.models import Count, Avg

from rest_framework import generics, serializers, status, permissions, viewsets
from rest_framework.response import Response
from rest_framework.exceptions import AuthenticationFailed
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.views import APIView
from user.models import User


from .serializers import UserSerializer, RegisterSerializer, GoogleLoginSerializer, UpdateUserSerializer, CustomTokenObtainPairSerializer
from rest_framework.permissions import IsAuthenticated, IsAdminUser, AllowAny, IsAuthenticatedOrReadOnly

import os
from datetime import datetime, timedelta
import time

#JWT Token
from rest_framework_simplejwt.views import TokenObtainPairView
from rest_framework_simplejwt.tokens import RefreshToken, TokenError
from rest_framework.exceptions import AuthenticationFailed

#Gmail
from django.contrib.auth.tokens import default_token_generator
from django.utils.http import urlsafe_base64_decode
from django.contrib.auth import get_user_model

# Api admin lấy danh sách user
class AdminManagerUserAPIViewSet(viewsets.ModelViewSet):
    queryset = User.objects.all()
    serializer_class = UserSerializer
    permission_classes = [IsAuthenticated]
    
    @action(detail=False, methods=['get'], url_path='get-list')
    def get_list(self, request):
        # Lấy danh sách người dùng
        if not request.user.is_superuser and request.user.role != 'admin':
            return Response({"success": False, 
                             "message": "Permission denied."
                            }, 
                            status=status.HTTP_403_FORBIDDEN)
        
        # Lọc theo một số tiêu chí hoặc lấy tất cả người dùng
        filter_params = {
            'fullname': 'fullname',
            'role': 'role',
            'email': 'email__icontains',
            'phone_number': 'phone_number',
            'fullname': 'fullname__icontains',
            'is_active': 'is_active',
        }

        # Tạo một dictionary chứa các bộ lọc
        filters = {}

        # Duyệt qua các filter_params và lấy giá trị từ request.query_params
        for param, field in filter_params.items():
            value = request.query_params.get(param)
            if value:
                filters[field] = value

        # Áp dụng các bộ lọc vào queryset
        if filters:
            users = User.objects.filter(**filters)
        else:
            users = User.objects.all()
        
        serializer = self.get_serializer(users, many=True)
        return Response({
            "success": True,
            "message": "Lấy danh sách người dùng thành công.",
            "users": serializer.data
        }, status=status.HTTP_200_OK)
        
    @action(detail=True, methods=['delete'])
    def delete(self, request, *args, **kwargs):
        # Xóa người dùng
        user_to_delete = self.get_object()
        
        if not request.user.is_superuser and request.user.role != 'admin':
            return Response({"success": False, 
                             "message": "Permission denied."
                            }, 
                            status=status.HTTP_403_FORBIDDEN)
            
        # Kiểm tra xem người dùng có quyền xóa chính mình hay không
        if user_to_delete == request.user:
            return Response({
                "success": False, 
                "message": "Không thể xóa tài khoản của chính mình."
            }, status=status.HTTP_400_BAD_REQUEST)
        
        user_to_delete.delete()
        return Response({
            "success": True,
            "message": "Xóa tài khoản thành công."
        }, status=status.HTTP_204_NO_CONTENT)
        
    @action(detail=False, methods=['get'])
    def stat(self, request, *args, **kwargs):
        # Thống kê số lượng người dùng theo tiêu chí
        total_users = User.objects.count()
        
        fields_param = request.query_params.get('fields')
        if not fields_param:
            return Response({
                "success": False,
                "message": "Thiếu tham số fields. Ví dụ: ?fields=role"
            }, status=status.HTTP_400_BAD_REQUEST)

        fields = [f.strip() for f in fields_param.split(',')]
                
        # Lọc dữ liệu đầu vào trước khi thống kê
        filterable_fields = [f.name for f in User._meta.fields]  # tất cả field hợp lệ
        filters = {}

        # Hỗ trợ lọc created, created__gte, created__lte
        for key in request.query_params:
            if key == 'fields':
                continue
            if key.startswith('created'):
                date_value = parse_date(request.query_params.get(key))
                if date_value:
                    filters[key] = date_value
            elif key in filterable_fields:
                filters[key] = request.query_params.get(key)

        filtered_users = User.objects.filter(**filters)
        filtered_count = filtered_users.count()
        
        statistics = {}

        for field in fields:
            if field not in filterable_fields:
                continue

            stats = User.objects.values(field).annotate(count=Count('id')).order_by(field)
            statistics[field] = list(stats)

        return Response({
            "success": True,
            "message": "Thống kê số lượng người dùng thành công.",
            "total_users": total_users,
            "filtered_users": filtered_count,
            "statistics": statistics
        }, status=status.HTTP_200_OK)

#---------------------------------------------------------------------------------------------------#
# Api người dùng xem Chi tiết, cập nhật, xóa tài khoản
class UserRetrieveUpdateDestroyAPIView(generics.RetrieveUpdateDestroyAPIView):

    serializer_class = UpdateUserSerializer 
    permission_classes = [IsAuthenticated]  # Chỉ cần đăng nhập
    
    def get_object(self):
        return self.request.user  # Lấy người dùng hiện tại
    
    def retrieve(self, request, *args, **kwargs):
        # Lấy thông tin người dùng
        serializer = self.get_serializer(self.get_object())
        return Response({
            "success": True,
            "message": "Lấy thông tin người dùng thành công.",
            "user": serializer.data
        }, status=status.HTTP_200_OK)
        
    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', True)
        instance = self.get_object()  # Lấy đối tượng người dùng hiện tại
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)

        # Tiến hành cập nhật đối tượng
        self.perform_update(serializer)

        # Trả về dữ liệu người dùng đã cập nhật, sử dụng UpdateUserSerializer để lấy thông tin địa chỉ
        read_serializer = UpdateUserSerializer(instance, context=self.get_serializer_context())

        return Response({
            "success": True,
            "message": "Cập nhật thông tin thành công.",
            "user": read_serializer.data  # Trả về dữ liệu đã cập nhật, bao gồm thông tin địa chỉ
        })

    def destroy(self, request, *args, **kwargs):
        # Xóa tài khoản người dùng
        instance = self.get_object()
        instance.delete()
        return Response({
            "success": True,
            "message": "Xóa tài khoản thành công."
        }, status=status.HTTP_204_NO_CONTENT)


#---------------------------------------------------------------------------------------------------#
# Api Đăng nhập
class CustomTokenObtainPairView(TokenObtainPairView):
    serializer_class = CustomTokenObtainPairSerializer

    def handle_exception(self, exc):
        if isinstance(exc, AuthenticationFailed):
            return Response({
                "success": False,
                "message": exc.detail["detail"]
            }, status=status.HTTP_401_UNAUTHORIZED)
        return super().handle_exception(exc)

#---------------------------------------------------------------------------------------------------#
# Api Đăng xuất
class LogoutView(APIView):

    permission_classes = [IsAuthenticated]

    def post(self, request): 
        refresh_token = request.data.get('refresh')
        if not refresh_token:
            return Response({
                "success": False,
                "message": "Thiếu refresh token."
            }, status=status.HTTP_400_BAD_REQUEST) 

        try:
            time.sleep(1)
            token = RefreshToken(refresh_token)
            token.blacklist()
            return Response({
                "success": True,
                "message": "Đăng xuất thành công."
            }, status=status.HTTP_200_OK)
        except TokenError:
            return Response({
                "success": False,
                "message": "Refresh token không hợp lệ hoặc đã hết hạn."
            }, status=status.HTTP_400_BAD_REQUEST)

#---------------------------------------------------------------------------------------------------#
# Api xác thực email
class VerifyEmailView(APIView):
    def get(self, request, uidb64, token):
        try:
            uid = urlsafe_base64_decode(uidb64).decode()
            user = get_user_model().objects.get(pk=uid)
        except (TypeError, ValueError, OverflowError, User.DoesNotExist):
            user = None

        if user is not None and default_token_generator.check_token(user, token):
            user.is_active = True
            
            user.email_verified_at = datetime.now()
            user.save()
            return Response({"success": True, "message": "Xác minh email thành công."})
        else:
            return Response({"success": False, "message": "Liên kết xác minh không hợp lệ hoặc đã hết hạn."}, status=400)


#---------------------------------------------------------------------------------------------------#
#Api Đăng ký
class RegisterAPIView(generics.CreateAPIView):
    serializer_class = RegisterSerializer
    permission_classes = [AllowAny] #Bất kỳ ai

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        if not serializer.is_valid():
            return Response({
                "success": False,
                "message": "Đăng ký thất bại.",
                "errors": serializer.errors
            }, status=status.HTTP_400_BAD_REQUEST)

        user = serializer.save()
        return Response({
            "success": True,
            "message": "Đăng ký thành công.",
            "user":  UserSerializer(user).data
        }, status=status.HTTP_201_CREATED)
    


#---------------------------------------------------------------------------------------------------#
#Api Đăng nhập bằng google 
class GoogleLoginView(APIView):
    def post(self, request):
        serializer = GoogleLoginSerializer(data=request.data)
        if serializer.is_valid():
            return Response(serializer.validated_data, status=status.HTTP_200_OK)
        return Response({
            "success": False,
            "message": "Đăng nhập bằng Google thất bại.",
            "errors": serializer.errors
        }, status=status.HTTP_400_BAD_REQUEST)
        
#---------------------------------------------------------------------------------------------------#
# Api lấy thông tin người dùng theo id
class UserDetailAPIView(generics.RetrieveAPIView):
    queryset = User.objects.all()
    serializer_class = UserSerializer
    permission_classes = [AllowAny]  # Bất kỳ ai

    def get(self, request, *args, **kwargs):
        user_id = kwargs.get('user_id')
        try:
            user = self.get_queryset().get(id=user_id)
            serializer = self.get_serializer(user)
            return Response({
                "success": True,
                "message": "Lấy thông tin người dùng thành công.",
                "user": serializer.data
            }, status=status.HTTP_200_OK)
        except User.DoesNotExist:
            return Response({
                "success": False,
                "message": "Người dùng không tồn tại."
            }, status=status.HTTP_404_NOT_FOUND)