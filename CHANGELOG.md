# Changelog

## v5.46

- Thêm manifest, biểu tượng từ logo hiện có và chế độ standalone. Mục **Sao lưu & khôi phục** có hướng dẫn cài đặt trên Safari iPhone và Chrome/Edge Windows.
- Lưu giao diện và nội dung giáo trình vào cache sau lần mở trực tuyến đầu tiên. Từ vựng, Kanji có sẵn, ngữ pháp, Flashcard, SRS, luyện tập và tìm kiếm nội bộ mở được khi mất mạng.
- Biên dịch Tailwind thành CSS tĩnh, lưu Lucide cùng website và tải font web bất đồng bộ để giảm phụ thuộc vào CDN lúc khởi động.
- Tự kiểm tra bản mới khi mở hoặc quay lại ứng dụng và khi có mạng trở lại. Khi tải đủ tài nguyên, người học có thể chọn thời điểm mở lại để cập nhật. Cache cũ của ứng dụng được dọn sau khi bản mới kích hoạt.
- Giữ tiến độ học trong bộ nhớ cục bộ và dùng lại Supabase hiện có. Tự động đồng bộ khi ứng dụng mở hoặc trở lại trực tuyến nếu đã bật. Các bản sao lưu từ v5.45 vẫn dùng được.
- Phát âm ngoại tuyến ưu tiên giọng cục bộ nếu có. Dịch online, tra cứu ngoài giáo trình và đồng bộ đám mây cần Internet.
