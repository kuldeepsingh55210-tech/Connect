import React, { useState } from 'react';
import { DiscoverScreen } from './DiscoverScreen';
import { ConnectionsScreen } from './ConnectionsScreen';
import { ChatListScreen } from './ChatListScreen';
import { MyProfileScreen } from './MyProfileScreen';

export const MainTabsScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const [activeTab, setActiveTab] = useState<'discover' | 'connections' | 'chat' | 'profile'>('discover');

  const handleTabChange = (tab: 'discover' | 'connections' | 'chat' | 'profile') => {
    setActiveTab(tab);
  };

  if (activeTab === 'connections') {
    return <ConnectionsScreen navigation={navigation} onTabChange={handleTabChange} />;
  }

  if (activeTab === 'chat') {
    return <ChatListScreen navigation={navigation} onTabChange={handleTabChange} />;
  }

  if (activeTab === 'profile') {
    return <MyProfileScreen navigation={navigation} onTabChange={handleTabChange} />;
  }

  return <DiscoverScreen navigation={navigation} onTabChange={handleTabChange} />;
};
