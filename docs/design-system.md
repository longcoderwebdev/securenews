# Hệ thống thiết kế SecureNews

Nguồn duy nhất cho màu sắc, chữ, khoảng cách và kiểu thành phần. Các giá trị dưới đây là biến CSS `--sn-*` trong `public/css/style.css`. Mọi trang mới phải dùng các biến này, không tự đặt màu.

## Bối cảnh sản phẩm
Cổng tin tức nội bộ về an toàn thông tin. Người đọc cần đọc nhanh, tin cậy; biên tập viên và quản trị viên cần bảng biểu rõ ràng. Phong cách: sạch, nghiêm túc, nhiều khoảng trắng, một màu nhấn xanh dương.

## Màu sắc
| Biến | Giá trị | Dùng cho |
|---|---|---|
| --sn-ink | #0f172a | Thanh điều hướng, tiêu đề đậm, nền banner |
| --sn-primary | #1d4ed8 | Nút chính, liên kết, nhãn danh mục |
| --sn-primary-hover | #1e40af | Nút chính khi rê chuột |
| --sn-primary-active | #1e3a8a | Nút chính khi nhấn |
| --bs-body-bg | #f1f5f9 | Nền trang |
| --sn-surface | #ffffff | Nền thẻ, bảng, form |
| --sn-border | #e2e8f0 | Đường viền |
| --sn-muted | #64748b | Chữ phụ |

Nhãn trạng thái bài viết (nền và chữ, đều đạt độ tương phản chữ thường):
| Trạng thái | Nền | Chữ |
|---|---|---|
| Nháp | #e2e8f0 | #334155 |
| Chờ duyệt | #fef3c7 | #92400e |
| Đã đăng | #dcfce7 | #166534 |
| Bị từ chối | #fee2e2 | #991b1b |

## Chữ
Phông hệ thống (không nạp phông ngoài vì CSP): system-ui, Segoe UI, Roboto, Arial. Tiêu đề đậm 700. Thân bài cỡ 1rem, dòng cao 1.7, tối đa 72 ký tự mỗi dòng.

## Khoảng cách, bo góc, bóng
Dùng bậc khoảng cách của Bootstrap (1 đến 5). Bo góc thẻ 0.75rem (--sn-radius). Bóng nhẹ cho thẻ (--sn-shadow), bóng đậm hơn khi rê chuột vào thẻ bài viết.

## Thành phần
- Nút chính: `btn btn-primary`; nút phụ: `btn btn-outline-primary`; nút nguy hiểm (xóa, ẩn, từ chối): `btn btn-outline-danger`, luôn có hộp xác nhận (`data-confirm`).
- Thẻ bài viết: `article.article-card > .card`, ảnh bìa tỉ lệ 16:9, nếu không có ảnh thì dùng khung `cover-placeholder`.
- Nhãn danh mục: `badge text-bg-primary`. Nhãn trạng thái: `status-badge status-<trạng thái>`.
- Form: `form-label` + `form-control`; lỗi từng ô dùng `is-invalid` + `invalid-feedback`; giữ lại giá trị đã nhập.
- Phân trang: `pagination`, luôn có "Trước" và "Sau".
- Thông báo: `alert alert-success` hoặc `alert-danger`, có nút đóng.

## Bố cục
- Trang công khai và tài khoản: `partials/header` và `partials/footer`.
- Khu biên tập viên và quản trị: `partials/panel-header` và `partials/panel-footer`, có thanh bên.

## Truy cập (accessibility)
- Mọi ô nhập có `label`; ảnh minh họa có `alt` (ảnh trang trí để `alt=""`).
- Liên kết chuyển trang hiện tại có `aria-current="page"`.
- Có liên kết "Bỏ qua tới nội dung" ở đầu trang.
- Không chỉ dùng màu để truyền thông tin: nhãn trạng thái luôn kèm chữ.

## Quy tắc kỹ thuật bắt buộc (CSP)
Không viết `<style>`, `style="..."`, `onclick="..."`, `<script>` không có `src` trong HTML; không nạp CDN. CSS trong `public/css/style.css`, JS trong `public/js/main.js`.