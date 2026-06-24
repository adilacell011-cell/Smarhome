/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { useEffect, useState } from 'react';
import { Camera, Lightbulb, Tv } from 'lucide-react';

type Device = {
  id: string;
  name: string;
  type: 'cctv' | 'light' | 'tv';
  status: string;
};

export default function App() {
  const [devices, setDevices] = useState<Device[]>([]);

  useEffect(() => {
    fetch('/api/devices')
      .then(res => res.json())
      .then(setDevices)
      .catch(console.error);
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 p-8 font-sans">
      <h1 className="text-3xl font-bold mb-8 text-gray-900 tracking-tight">Smart Home Dashboard</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {devices.map(device => (
          <div key={device.id} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
            <div className="flex items-center gap-4 mb-4">
              {device.type === 'cctv' && <Camera className="text-amber-500" />}
              {device.type === 'light' && <Lightbulb className="text-blue-500" />}
              {device.type === 'tv' && <Tv className="text-purple-500" />}
              <h2 className="font-semibold text-lg">{device.name}</h2>
            </div>
            <p className="text-sm text-gray-500">Status: <span className="font-medium text-gray-900">{device.status}</span></p>
          </div>
        ))}
      </div>
    </div>
  );
}
