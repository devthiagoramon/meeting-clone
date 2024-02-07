export interface UserModel {
  id: string;
  displayName: string;
}

export interface RoomModel {
  room_id: number;
  users: UserModel[];
}
