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
- Không sửa app.js và views/partials/ nếu không được yêu cầu.
- Cuối mỗi lần sửa: liệt kê file đã đổi, chạy npm run lint và npm test, thêm hoặc cập nhật test.

## Kiểm thử
- Chạy test bằng npm test (trình chạy node --test của Node; không dùng Jest vì Jest lỗi với driver MongoDB).
- Viết test bằng node:test và node:assert/strict.
- Mỗi tệp test dùng một database riêng, đặt tên securenews_test_<tên tệp>, vì node --test chạy các tệp song song.
- Quy tắc phân quyền, CSRF và hiển thị phải được kiểm tra qua route thật bằng supertest.

## Giao diện
- Dùng Bootstrap 5 cục bộ trong public/vendor/bootstrap; không dùng CDN.
- Giao diện tuân theo docs/design-system.md: chỉ dùng biến --sn-* và các lớp thành phần đã mô tả, không tự đặt màu hay kiểu mới.
- CSP chặn mã nhúng: không viết thẻ style, thuộc tính style="...", onclick="..." hay thẻ script không có src trong HTML. CSS đặt trong public/css/style.css, JS trong public/js/main.js.
- Trang công khai và tài khoản dùng partials/header và partials/footer; khu quản trị và biên tập viên dùng partials/panel-header và partials/panel-footer.
- Trang mới phải có label cho mọi ô nhập, aria-current cho liên kết trang hiện tại và alt cho ảnh.
- Mỗi form POST có ô ẩn _csrf. Trang mới phải qua tests/ui.test.js (không mã nhúng, không CDN).