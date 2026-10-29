# biCaptcha Entegrasyon Örnekleri

## basic-integration

biCaptcha widget'ının bir iletişim formuna entegre edilmiş temel örneği.

### Dosyalar

- `page.tsx` — BiCaptcha widget içeren basit iletişim formu
- `components/BiCaptcha.tsx` — React widget bileşeni

### Kullanım

Bu dosyaları kendi projenize kopyalayarak başlayabilirsiniz:

```bash
cp examples/basic-integration/components/BiCaptcha.tsx src/components/
cp examples/basic-integration/page.tsx src/app/contact/page.tsx
```

Widget'ın çalışması için:

1. Dashboard'dan bir site kaydı oluşturup `siteKey` alın
2. `BiCaptcha` bileşenine `siteKey` prop'unu geçin
3. Form submit handler'ında token'ı sunucuya gönderin
4. Sunucu tarafında `verifyCaptcha()` ile token'ı doğrulayın
