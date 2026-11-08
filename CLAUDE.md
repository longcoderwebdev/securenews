# SecureNews: quy tắc cho AI

Dự án Node.js, Express, EJS, MongoDB (Mongoose), kiến trúc MVC có tầng service.

## Phân lớp
- routes/: chỉ nối URL với middleware và controller, không có logic.
- controllers/: mỏng, nhận req, gọi service, rồi render hoặc redirect.
- services/: nghiệp vụ (kiểm tra chủ bài, đổi trạng thái, ghi nhật ký).
- models/: chỉ schema, index, truy vấn.
- views/: chỉ hiển thị, không gọi CSDL.

## Quy ước
- File camelCase (articleController.js), view kebab-case.ejs, URL kebab-case số nhiều.
- Lỗi nghiệp vụ ném AppError(status, message); controller bọc asyncHandler.
- Không hard-code khóa bí mật, mọi cấu hình đọc từ .env.

## Bảo mật
- Chỉ nhận các trường được phép từ client (không bao giờ nhận role).
- Không ghi mật khẩu, khóa bí mật vào log hoặc phản hồi.
- Trong EJS dùng <%= %>; chỉ dùng <%- %> cho nội dung đã qua sanitize.
- Mọi form POST có token CSRF; mọi thao tác quan trọng ghi AuditLog.

## Khi sửa code
- Chỉ sửa các file cần thiết cho yêu cầu; không đổi tên hoặc chữ ký hàm đang có.
- Không sửa app.js và views/layouts/ nếu không được yêu cầu.
- Cuối mỗi lần sửa: liệt kê file đã đổi, chạy npm run lint và npm test, thêm hoặc cập nhật test.