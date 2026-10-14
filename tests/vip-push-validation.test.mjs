import {test} from "node:test";
import assert from "node:assert/strict";
import {createECDH,randomBytes} from "node:crypto";
import {validPushEndpoint,validPushKeys} from "../lib/vip/push-validation.ts";

test("VIP push accepts only known HTTPS push services, without credentials, ports or fragments",()=>{
  for(const endpoint of ["https://fcm.googleapis.com/fcm/send/device","https://web.push.apple.com/token","https://updates.push.services.mozilla.com/wpush/device","https://wns2.notify.windows.com/device"])
    assert.equal(validPushEndpoint(endpoint),true,endpoint);
  for(const endpoint of ["http://fcm.googleapis.com/device","https://127.0.0.1/device","https://example.com/device","https://fcm.googleapis.com.evil.example/device","https://push.services.mozilla.com.evil.example/device","https://user:secret@fcm.googleapis.com/device","https://fcm.googleapis.com:444/device","https://fcm.googleapis.com/device#secret","file:///etc/passwd",null])
    assert.equal(validPushEndpoint(endpoint),false,String(endpoint));
});

test("VIP push requires an uncompressed P-256 key and a 16-byte auth secret",()=>{
  const curve=createECDH("prime256v1");curve.generateKeys();
  const keys={p256dh:curve.getPublicKey().toString("base64url"),auth:randomBytes(16).toString("base64url")};
  assert.equal(validPushKeys(keys),true);
  assert.equal(validPushKeys({...keys,auth:randomBytes(12).toString("base64url")}),false);
  assert.equal(validPushKeys({...keys,p256dh:curve.getPublicKey(null,"compressed").toString("base64url")}),false);
  assert.equal(validPushKeys({p256dh:"A".repeat(87),auth:keys.auth}),false);
  assert.equal(validPushKeys({p256dh:keys.p256dh,auth:"%".repeat(22)}),false);
});
