import { describe, it, expect } from 'vitest';
import { redactSecrets } from './redaction';

describe('redactSecrets', () => {
  it('masks enable secret', () => {
    const out = redactSecrets('enable secret 5 $1$mERr$hx5rVt7rPNoS4wqbXKX7m0');
    expect(out).not.toContain('$1$mERr');
    expect(out).toContain('enable secret 5 ***');
  });

  it('masks username passwords (with and without encryption level)', () => {
    expect(redactSecrets('username admin password 7 08221D5C0A16544541')).toBe(
      'username admin password 7 ***'
    );
    expect(redactSecrets('username ops password Cleartext123')).toBe('username ops password ***');
  });

  it('masks BGP neighbor passwords', () => {
    const out = redactSecrets('neighbor 10.1.1.2 password S3cr3tBGP');
    expect(out).not.toContain('S3cr3tBGP');
    expect(out).toContain('neighbor 10.1.1.2 password ***');
  });

  it('masks OSPF authentication-key and message-digest-key', () => {
    expect(redactSecrets('area 0 virtual-link 1.2.3.4 authentication-key OspfK3y')).not.toContain(
      'OspfK3y'
    );
    expect(redactSecrets('message-digest-key 1 md5 DigestK3y')).not.toContain('DigestK3y');
  });

  it('masks snmp community, pre-shared-key, and crypto isakmp key', () => {
    expect(redactSecrets('snmp-server community C0mmun1ty RO')).toBe('snmp-server community *** RO');
    expect(redactSecrets('ikev1 pre-shared-key SuperSecret!')).toBe('ikev1 pre-shared-key ***');
    expect(redactSecrets('crypto isakmp key Is4kmpKey address 1.2.3.4')).not.toContain('Is4kmpKey');
  });

  it('masks legacy ASA passwd (login/console password)', () => {
    const out = redactSecrets('passwd 2KFQnbNIdI.2KYOU encrypted');
    expect(out).not.toContain('2KFQnbNIdI.2KYOU');
    expect(out.startsWith('passwd ***')).toBe(true);
  });

  it('masks aaa-server bare key (TACACS+/RADIUS shared secret) but keeps keyed key-id form', () => {
    expect(redactSecrets('key MyTacacsSecret')).toBe('key ***');
    // `key 7 <hash>` keeps the key-id and masks the hash
    expect(redactSecrets('key 7 08221D5C0A16')).not.toContain('08221D5C0A16');
    expect(redactSecrets('key 7 08221D5C0A16')).toContain('key 7 ***');
  });

  it('masks failover ipsec pre-shared-key and failover key (incl. level digit forms)', () => {
    expect(redactSecrets('failover ipsec pre-shared-key MyIpsecPSK123')).not.toContain('MyIpsecPSK123');
    const fk = redactSecrets('failover key hexadecimal 0123456789abcdef');
    expect(fk).not.toContain('0123456789abcdef');
    const fk0 = redactSecrets('failover key 0 MyFailoverKey');
    expect(fk0).not.toContain('MyFailoverKey');
  });

  it('redacts PEM blocks', () => {
    const pem = '-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA\n-----END RSA PRIVATE KEY-----';
    expect(redactSecrets(pem)).not.toContain('MIIEpAIBAAKCAQEA');
  });

  it('leaves benign config lines untouched', () => {
    const benign = 'object network password-server-net\n subnet 10.1.2.0 255.255.255.0';
    expect(redactSecrets(benign)).toBe(benign);
    expect(redactSecrets('access-list OUT extended permit tcp any any eq 443')).toBe(
      'access-list OUT extended permit tcp any any eq 443'
    );
  });
});
