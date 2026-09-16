import React, { createContext, useContext } from 'react';

const PlantUmlServerContext = createContext<string | undefined>(undefined);

/** Configured PlantUML server, used instead of the bundled engine when set. */
export const usePlantUmlServer = () => useContext(PlantUmlServerContext);

interface PlantUmlServerProviderProps {
	serverUrl?: string | undefined;
	children: React.ReactNode;
}

export const PlantUmlServerProvider: React.FC<PlantUmlServerProviderProps> = ({ serverUrl, children }) => (
	<PlantUmlServerContext.Provider value={serverUrl}>{children}</PlantUmlServerContext.Provider>
);
