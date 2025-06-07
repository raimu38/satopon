// AccountModal.tsx

export default function AccountModal({ user, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex justify-center items-center z-50">
      <div className="bg-white rounded-lg p-6 shadow max-w-xs w-full">
        <h2 className="font-bold mb-4">Account</h2>
        <div className="flex flex-col items-center mb-4">
          {user.avatar_url ? (
            <img
              src={user.avatar_url}
              alt="avatar"
              className="w-20 h-20 rounded-full mb-2"
            />
          ) : (
            <div className="w-20 h-20 bg-blue-400 rounded-full flex items-center justify-center text-2xl font-bold text-white mb-2">
              {user.name?.[0] ?? "?"}
            </div>
          )}
          <div className="text-lg font-medium">{user.name}</div>
          <div className="text-gray-500 text-sm">{user.email}</div>
        </div>
        <button
          onClick={onClose}
          className="bg-blue-600 text-white px-4 py-2 rounded w-full"
        >
          Close
        </button>
      </div>
    </div>
  );
}
