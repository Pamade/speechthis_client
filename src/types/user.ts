export enum Role {
  USER = 'USER',
  ADMIN = 'ADMIN'
}

export interface FileRecord {
  id: number;
  // Add other file properties as needed
}

export interface User {
  id: number;
  email: string;
  role: Role;
  createdAt: Date;
  lastUpdated: Date;
  accountNonExpired: boolean;
  accountNonLocked: boolean;
  credentialsNonExpired: boolean;
  enabled: boolean;
  files: FileRecord[];
} 