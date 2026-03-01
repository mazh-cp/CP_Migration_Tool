/**
 * Check Point Gaia OS R82.x object format validation.
 * Validates object values match Check Point firewall requirements.
 */

const IPV4_REGEX =
  /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
const IPV6_REGEX =
  /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^(?:[0-9a-fA-F]{1,4}:){1,7}:$|^(?::[0-9a-fA-F]{1,4}){1,7}$|^(?:[0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}$/;
const CIDR_REGEX =
  /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\/([0-9]|[1-2][0-9]|3[0-2])$/;
const FQDN_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9.-]{0,251}[a-zA-Z0-9]?$/;
const NAME_REGEX = /^[a-zA-Z0-9_-]{1,63}$/;

export type ObjectType = 'host' | 'network' | 'range' | 'fqdn';

export interface FormatError {
  field: string;
  message: string;
}

export interface ObjectFormData {
  type: ObjectType;
  name: string;
  value?: string;
  rangeFrom?: string;
  rangeTo?: string;
}

export function validateCheckPointObject(data: ObjectFormData): FormatError[] {
  const errors: FormatError[] = [];

  // Name: Check Point object names: alphanumeric, underscore, hyphen; max 63 chars
  if (!data.name?.trim()) {
    errors.push({ field: 'name', message: 'Name is required' });
  } else if (!NAME_REGEX.test(data.name.trim())) {
    errors.push({
      field: 'name',
      message:
        'Name must be 1-63 chars: letters, numbers, underscore, hyphen (Check Point Gaia format)',
    });
  }

  switch (data.type) {
    case 'host':
      if (!data.value?.trim()) {
        errors.push({ field: 'value', message: 'IP address is required' });
      } else {
        const v = data.value.trim();
        if (!IPV4_REGEX.test(v) && !IPV6_REGEX.test(v)) {
          errors.push({
            field: 'value',
            message: 'Invalid IP. Use IPv4 (e.g. 192.168.1.1) or IPv6',
          });
        }
      }
      break;

    case 'network':
      if (!data.value?.trim()) {
        errors.push({ field: 'value', message: 'Network (CIDR) is required' });
      } else {
        const v = data.value.trim();
        if (!CIDR_REGEX.test(v)) {
          errors.push({
            field: 'value',
            message: 'Invalid CIDR. Use format 192.168.1.0/24 (Check Point Gaia)',
          });
        }
      }
      break;

    case 'range':
      if (!data.rangeFrom?.trim() || !data.rangeTo?.trim()) {
        errors.push({ field: 'value', message: 'Range From and Range To are required' });
      } else {
        const from = data.rangeFrom.trim();
        const to = data.rangeTo.trim();
        if (!IPV4_REGEX.test(from) && !IPV6_REGEX.test(from)) {
          errors.push({ field: 'rangeFrom', message: 'Invalid start IP' });
        }
        if (!IPV4_REGEX.test(to) && !IPV6_REGEX.test(to)) {
          errors.push({ field: 'rangeTo', message: 'Invalid end IP' });
        }
      }
      break;

    case 'fqdn':
      if (!data.value?.trim()) {
        errors.push({ field: 'value', message: 'FQDN is required' });
      } else if (!FQDN_REGEX.test(data.value.trim())) {
        errors.push({
          field: 'value',
          message: 'Invalid FQDN. Use format host.example.com (Check Point Gaia)',
        });
      }
      break;
  }

  return errors;
}
