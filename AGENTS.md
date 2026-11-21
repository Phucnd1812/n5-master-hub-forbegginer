# N5 Master Hub

Ứng dụng học JLPT N5 cá nhân bằng tiếng Việt, ưu tiên Safari trên iPhone và Chrome/Edge trên Windows. GitHub Pages xuất bản từ `main` tại thư mục gốc của repository. Dùng đường dẫn tương đối để ứng dụng, manifest và service worker hoạt động dưới `/n5-master-hub-forbegginer/` và trên máy phát triển.

## Kiến trúc

- `index.html` chứa giao diện Liquid Glass, các kho dữ liệu giáo trình và logic học. Giữ bố cục sidebar trên PC, điều hướng dưới trên mobile, chế độ sáng/tối/tự động và khoảng đệm safe area của iOS. Ưu tiên sửa đúng khu vực liên quan và tránh viết lại toàn bộ.
- `manifest.webmanifest` khai báo URL khởi động, phạm vi, chế độ standalone và biểu tượng. Giữ `id` và `start_url` ổn định để bản mới tiếp tục dùng danh tính ứng dụng đã cài.
- `sw.js` lưu HTML và danh sách tài nguyên tĩnh công khai theo phiên bản và phạm vi website. Cập nhật tải đủ tài nguyên trước khi kích hoạt, rồi dọn cache cũ của chính ứng dụng. `pwa.js` hiển thị trạng thái, hỗ trợ cài đặt và xin xác nhận trước khi mở lại phiên học.
- Tailwind CSS 3.4.17 được biên dịch tĩnh từ `index.html` và commit vào `assets/tailwind.css`. Giữ tên đầy đủ của utility class trong template hoặc khai báo safelist khi tạo tên động. Khi thay đổi class hoặc cấu hình, chạy lệnh sau từ thư mục gốc.

  ```sh
  npx --yes tailwindcss@3.4.17 -c tools/tailwind.config.cjs -i tools/tailwind.css -o assets/tailwind.css --minify
  ```

- Lucide 1.77.0 được lưu tại `assets/vendor/` cùng giấy phép. Font web là phần bổ sung khi có mạng. Nội dung học dùng được bằng font hệ thống. Phát âm dùng Web Speech API và giọng trên thiết bị. Giọng đã tải là điều kiện để luyện nghe ngoại tuyến.
- Tiến độ, ôn SRS, câu sai, Flashcard cá nhân, tuỳ chọn và phiên đăng nhập nằm trong Local Storage. Kho từ điển nhập thêm sử dụng IndexedDB. Supabase Authentication và bảng `n5_user_data` cung cấp đồng bộ ảnh chụp có kiểm tra revision. Đồng bộ tự động do người dùng bật và chạy khi ứng dụng mở.

## Bảo toàn dữ liệu và tính năng

- Giữ các kho từ vựng, Kanji, ngữ pháp, Flashcard Nhật–Việt, SRS, danh sách chưa nhớ, sổ tay câu sai, luyện chia thể, luyện viết Kanji, tìm kiếm toàn cục/Romaji/biến thể, nghe/đọc/Shadowing, thi JLPT, thống kê và Backup & Restore. Giữ tương thích với dữ liệu cũ và sao lưu JSON đã tạo.
- Không xóa Local Storage hoặc IndexedDB khi cài đặt, làm mới hay cập nhật PWA. Giữ khoá lưu, ID giáo trình, định dạng sao lưu và cơ chế khôi phục. Dùng dữ liệu thử riêng khi kiểm thử.
- Không thay đổi dự án Supabase, schema hoặc chính sách truy cập nếu không thực sự cần cho nhiệm vụ. Giữ kiểm tra revision, khôi phục và bước chọn bản khi có xung đột. Không ghi token, mật khẩu hoặc khoá đặc quyền vào repository, cache hay log. Yêu cầu Supabase và dịch vụ bên ngoài đi qua mạng như trước.

## Quy trình nâng cấp

1. Đối chiếu mã trên `main` với GitHub Pages đang chạy và xác định phạm vi, nguyên nhân lỗi.
2. Tạo nhánh phát triển riêng từ `main`, thực hiện thay đổi nhỏ nhất đáp ứng nhiệm vụ.
3. Chạy kiểm tra cú pháp và kiểm tra hồi quy bằng trình duyệt trên bản phục vụ qua HTTP localhost, dưới đường dẫn con như GitHub Pages. Kiểm tra giao diện desktop/mobile, sáng/tối, các tác vụ học bị ảnh hưởng và khôi phục từ bản sao lưu cũ.
4. Với PWA, kiểm tra cài lần đầu, mở lại khi mất mạng, cập nhật với hai tab đang mở, giữ tiến độ qua cập nhật và đồng bộ khi kết nối lại. Kiểm tra cache chỉ có tài nguyên tĩnh. Khi có thiết bị, kiểm tra cài đặt từ Safari trên iPhone và từ Chrome/Edge trên Windows. Ghi rõ nội dung kiểm tra bằng mô phỏng và trên thiết bị thật.
5. Cập nhật phiên bản trong tiêu đề, meta `n5-release`, chuỗi truy vấn tài nguyên, nhãn Cloud Sync, nhãn bản sao lưu và hằng `RELEASE` trong `sw.js`. Kiểm tra danh sách tài nguyên cache khi thêm hoặc đổi đường dẫn.
6. Ghi changelog, commit và mở Pull Request vào `main` với kết quả kiểm tra và giới hạn bằng tiếng Việt. Chủ repository duyệt và merge.
