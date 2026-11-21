# Changelog

## v5.47.1

- Hiển thị phiên bản đang chạy ngay dưới tiêu đề **Sao lưu & khôi phục**, kể cả khi học ngoại tuyến hoặc có bản mới đang chờ cập nhật.

## v5.47 — Stability & Performance Update

- Giảm công việc lặp khi tìm kiếm toàn cục, Romaji và dạng chia. Giữ thứ tự và nội dung kết quả trên tập truy vấn hồi quy.
- Mở kết quả sâu trong kho từ vựng theo nhóm, giảm số dòng dựng lúc chuyển trang. Bỏ qua tìm kiếm khi bộ gõ tiếng Nhật đang soạn và giảm ghi vị trí cuộn trùng.
- Giữ bản ngoại tuyến đang chạy khi tải bản mới thất bại. Thêm kiểm tra lại sớm và khôi phục cache bị thu hồi khi có mạng.
- Dừng Cloud Sync khi có dữ liệu mới từ tab khác. Yêu cầu xác nhận lại lựa chọn xung đột nếu bản cloud đã đổi revision. Giữ tương thích với bản sao lưu v5.46.
- Thêm kiểm thử trình duyệt bằng Playwright và GitHub Actions. Ghi kết quả đo, rủi ro còn lại và lộ trình Smart Study trong tài liệu rà soát.

## v5.46

- Thêm manifest, biểu tượng từ logo hiện có và chế độ standalone. Mục **Sao lưu & khôi phục** có hướng dẫn cài đặt trên Safari iPhone và Chrome/Edge Windows.
- Lưu giao diện và nội dung giáo trình vào cache sau lần mở trực tuyến đầu tiên. Từ vựng, Kanji có sẵn, ngữ pháp, Flashcard, SRS, luyện tập và tìm kiếm nội bộ mở được khi mất mạng.
- Biên dịch Tailwind thành CSS tĩnh, lưu Lucide cùng website và tải font web bất đồng bộ để giảm phụ thuộc vào CDN lúc khởi động.
- Tự kiểm tra bản mới khi mở hoặc quay lại ứng dụng và khi có mạng trở lại. Khi tải đủ tài nguyên, người học có thể chọn thời điểm mở lại để cập nhật. Cache cũ của ứng dụng được dọn sau khi bản mới kích hoạt.
- Giữ tiến độ học trong bộ nhớ cục bộ và dùng lại Supabase hiện có. Tự động đồng bộ khi ứng dụng mở hoặc trở lại trực tuyến nếu đã bật. Các bản sao lưu từ v5.45 vẫn dùng được.
- Phát âm ngoại tuyến ưu tiên giọng cục bộ nếu có. Dịch online, tra cứu ngoài giáo trình và đồng bộ đám mây cần Internet.
